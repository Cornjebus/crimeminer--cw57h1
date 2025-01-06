# External imports with versions
import numpy as np  # v1.24.0
import cv2  # v4.8.0
import torch  # v2.0.0
from transformers import AutoImageProcessor, AutoModelForObjectDetection  # v4.30.0
import pytesseract  # v0.3.10
import json
import argparse
import logging
import gc
from threading import Lock
from functools import wraps
from typing import Dict, List, Union, Optional

# Global configurations
MODEL_CONFIGS = {
    'OBJECT_DETECTION': {
        'model_name': 'yolov5',
        'confidence_threshold': 0.5,
        'nms_threshold': 0.45,
        'batch_size': 16
    },
    'FACE_DETECTION': {
        'model_name': 'retinaface',
        'confidence_threshold': 0.7,
        'min_face_size': 20,
        'batch_size': 8
    },
    'OCR': {
        'lang': 'eng',
        'config': '--oem 3 --psm 11',
        'min_confidence': 0.6
    }
}

SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']
MAX_IMAGE_SIZE = 4096
RESOURCE_LIMITS = {
    'max_batch_size': 32,
    'max_memory_usage': 0.8,
    'gpu_memory_fraction': 0.9
}

# Decorator definitions
def error_handler(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            logging.error(f"Error in {func.__name__}: {str(e)}")
            raise
    return wrapper

def performance_tracker(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start_time = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start_time
        logging.info(f"{func.__name__} completed in {duration:.2f} seconds")
        return result
    return wrapper

def cuda_optimizer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if torch.cuda.is_available():
            with torch.cuda.device(0):
                torch.cuda.empty_cache()
                return func(*args, **kwargs)
        return func(*args, **kwargs)
    return wrapper

def thread_safe(cls):
    orig_init = cls.__init__
    def __init__(self, *args, **kwargs):
        orig_init(self, *args, **kwargs)
        self._lock = Lock()
    cls.__init__ = __init__
    return cls

@thread_safe
class ImageProcessor:
    def __init__(self, analysis_types: List[str], config: Dict = None):
        self.models = {}
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.config = config or MODEL_CONFIGS
        self.cache = {}
        self.model_lock = Lock()
        
        logging.info(f"Initializing ImageProcessor with device: {self.device}")
        self._initialize_models(analysis_types)

    def _initialize_models(self, analysis_types: List[str]) -> None:
        with self.model_lock:
            if 'OBJECT_DETECTION' in analysis_types:
                self.models['object_detection'] = AutoModelForObjectDetection.from_pretrained(
                    'facebook/detr-resnet-50'
                ).to(self.device)
                
            if 'FACE_DETECTION' in analysis_types:
                self.models['face_detection'] = torch.hub.load(
                    'pytorch/vision',
                    'retinanet_resnet50_fpn',
                    pretrained=True
                ).to(self.device)

    @cuda_optimizer
    def detect_objects(self, image: np.ndarray, model_config: Dict) -> List[Dict]:
        processor = AutoImageProcessor.from_pretrained('facebook/detr-resnet-50')
        inputs = processor(images=image, return_tensors="pt").to(self.device)
        
        with torch.no_grad():
            outputs = self.models['object_detection'](**inputs)
        
        results = []
        for score, label, box in zip(
            outputs.scores[0].cpu().numpy(),
            outputs.labels[0].cpu().numpy(),
            outputs.boxes[0].cpu().numpy()
        ):
            if score >= model_config['confidence_threshold']:
                results.append({
                    'bbox': box.tolist(),
                    'confidence': float(score),
                    'label': label.item()
                })
        
        return results

    @error_handler
    def process_ocr(self, image: np.ndarray) -> Dict:
        ocr_config = self.config['OCR']
        text = pytesseract.image_to_string(
            image,
            lang=ocr_config['lang'],
            config=ocr_config['config']
        )
        
        confidence = pytesseract.image_to_data(
            image,
            lang=ocr_config['lang'],
            config=ocr_config['config'],
            output_type=pytesseract.Output.DICT
        )
        
        return {
            'text': text,
            'confidence': float(np.mean([conf for conf in confidence['conf'] if conf != -1]))
        }

    @performance_tracker
    def process(self, image_path: str, options: Dict) -> Dict:
        try:
            # Image loading and validation
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Failed to load image: {image_path}")
            
            # Resize if necessary
            height, width = image.shape[:2]
            if max(height, width) > MAX_IMAGE_SIZE:
                scale = MAX_IMAGE_SIZE / max(height, width)
                image = cv2.resize(image, None, fx=scale, fy=scale)
            
            results = {
                'metadata': {
                    'image_size': {'width': width, 'height': height},
                    'processing_device': str(self.device)
                },
                'analysis': {}
            }
            
            # Process requested analysis types
            if 'object_detection' in options:
                results['analysis']['objects'] = self.detect_objects(
                    image,
                    self.config['OBJECT_DETECTION']
                )
            
            if 'ocr' in options:
                results['analysis']['ocr'] = self.process_ocr(image)
            
            # Cleanup
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            return results
            
        except Exception as e:
            logging.error(f"Error processing image {image_path}: {str(e)}")
            raise

@error_handler
@performance_tracker
def main(evidence_id: str, file_path: str, analysis_types: List[str], processing_options: Dict) -> str:
    # Validate input parameters
    if not evidence_id or not file_path:
        raise ValueError("Evidence ID and file path are required")
    
    # Initialize processor
    processor = ImageProcessor(analysis_types)
    
    # Process image
    results = processor.process(file_path, processing_options)
    
    # Add metadata
    results['evidence_id'] = evidence_id
    results['processing_timestamp'] = str(datetime.datetime.now(datetime.UTC))
    
    return json.dumps(results)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Image Evidence Processor")
    parser.add_argument("--evidence-id", required=True, help="Unique identifier for the evidence")
    parser.add_argument("--file-path", required=True, help="Path to the image file")
    parser.add_argument("--analysis-types", nargs="+", default=["object_detection", "ocr"],
                      help="Types of analysis to perform")
    
    args = parser.parse_args()
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        result = main(
            args.evidence_id,
            args.file_path,
            args.analysis_types,
            {'object_detection': True, 'ocr': True}
        )
        print(result)
    except Exception as e:
        logging.error(f"Processing failed: {str(e)}")
        sys.exit(1)