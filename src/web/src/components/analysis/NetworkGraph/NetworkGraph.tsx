/**
 * NetworkGraph Component
 * Secure, FedRAMP High and CJIS compliant network graph visualization
 * for entity relationship analysis with comprehensive audit logging.
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import ForceGraph2D from 'react-force-graph'; // v1.43.0
import { zoom, zoomIdentity } from 'd3-zoom'; // v3.0.0
import useSecurityContext from '@security/context'; // v2.0.0
import { AnalysisResult, SecurityContext } from '../../../types/analysis.types';
import { useAnalysis } from '../../../hooks/useAnalysis';

// Security-compliant color scheme for entity types
const NODE_COLORS = {
  PERSON: '#4285F4',
  LOCATION: '#34A853',
  ORGANIZATION: '#FBBC04',
  DATE: '#EA4335',
  DEFAULT: '#9AA0A6',
  CLASSIFIED: '#FF0000'
} as const;

// FedRAMP compliant graph configuration
const GRAPH_CONFIG = {
  nodeSize: 8,
  linkWidth: 2,
  linkDistance: 100,
  chargeStrength: -30,
  zoomExtent: [0.1, 4] as [number, number],
  maxNodes: 1000,
  updateThrottle: 100,
  securityLevels: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']
} as const;

interface NetworkGraphProps {
  evidenceId: string;
  securityContext: SecurityContext;
  onNodeSelect?: (node: SecureNode) => void;
  graphConfig?: Partial<typeof GRAPH_CONFIG>;
}

interface SecureNode {
  id: string;
  type: string;
  value: string;
  confidence: number;
  classification: string;
  metadata?: Record<string, any>;
  x?: number;
  y?: number;
}

interface SecureLink {
  source: string;
  target: string;
  type: string;
  confidence: number;
  classification: string;
}

interface GraphData {
  nodes: SecureNode[];
  links: SecureLink[];
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({
  evidenceId,
  securityContext,
  onNodeSelect,
  graphConfig = {}
}) => {
  // Refs and state
  const graphRef = useRef<any>();
  const { getResults, auditLog } = useAnalysis();
  const { validateAccess, checkClassification } = useSecurityContext();

  // Process analysis results into secure graph data
  const processGraphData = useCallback(async (results: AnalysisResult[]): Promise<GraphData> => {
    await auditLog('graph-data-process', { evidenceId });

    const nodes: SecureNode[] = [];
    const links: SecureLink[] = [];
    const processedNodes = new Set<string>();

    for (const result of results) {
      // Validate security context for each result
      if (!await validateAccess(result.content, securityContext)) {
        continue;
      }

      const entities = result.content.entities || [];
      
      for (const entity of entities) {
        // Check classification level access
        if (!await checkClassification(entity.classification, securityContext)) {
          continue;
        }

        const nodeId = `${entity.type}-${entity.value}`;
        
        if (!processedNodes.has(nodeId)) {
          processedNodes.add(nodeId);
          nodes.push({
            id: nodeId,
            type: entity.type,
            value: entity.value,
            confidence: entity.confidence,
            classification: entity.classification,
            metadata: entity.metadata
          });
        }

        // Create links between entities in the same result
        entities.forEach(targetEntity => {
          if (entity !== targetEntity) {
            const targetId = `${targetEntity.type}-${targetEntity.value}`;
            links.push({
              source: nodeId,
              target: targetId,
              type: 'RELATED',
              confidence: Math.min(entity.confidence, targetEntity.confidence),
              classification: Math.max(
                GRAPH_CONFIG.securityLevels.indexOf(entity.classification),
                GRAPH_CONFIG.securityLevels.indexOf(targetEntity.classification)
              ).toString()
            });
          }
        });
      }
    }

    return { nodes, links };
  }, [securityContext, validateAccess, checkClassification]);

  // Secure node click handler with audit logging
  const handleNodeClick = useCallback(async (node: SecureNode) => {
    try {
      // Validate access and log interaction
      if (!await validateAccess(node, securityContext)) {
        throw new Error('Access denied to node data');
      }

      await auditLog('node-interaction', {
        nodeId: node.id,
        nodeType: node.type,
        classification: node.classification
      });

      onNodeSelect?.(node);
    } catch (error) {
      console.error('Node interaction error:', error);
    }
  }, [securityContext, onNodeSelect]);

  // Secure zoom handler with boundaries
  const handleZoom = useCallback(() => {
    if (!graphRef.current) return;

    const graph = graphRef.current;
    const transform = zoom.transform;
    
    // Enforce zoom boundaries
    if (transform.k < GRAPH_CONFIG.zoomExtent[0]) {
      graph.zoom(GRAPH_CONFIG.zoomExtent[0]);
    } else if (transform.k > GRAPH_CONFIG.zoomExtent[1]) {
      graph.zoom(GRAPH_CONFIG.zoomExtent[1]);
    }
  }, []);

  // Load and process data securely
  useEffect(() => {
    let mounted = true;

    const loadGraphData = async () => {
      try {
        const results = await getResults(evidenceId);
        if (!mounted) return;

        const graphData = await processGraphData(results);
        if (graphRef.current) {
          graphRef.current.graphData(graphData);
        }
      } catch (error) {
        console.error('Error loading graph data:', error);
        await auditLog('graph-load-error', { evidenceId, error });
      }
    };

    loadGraphData();
    return () => { mounted = false; };
  }, [evidenceId, securityContext]);

  // Memoized graph configuration
  const graphConfiguration = useMemo(() => ({
    ...GRAPH_CONFIG,
    ...graphConfig,
    nodeColor: (node: SecureNode) => 
      NODE_COLORS[node.type as keyof typeof NODE_COLORS] || NODE_COLORS.DEFAULT,
    nodeLabel: (node: SecureNode) => 
      `${node.type}: ${node.value} (${Math.round(node.confidence * 100)}%)`,
    linkColor: (link: SecureLink) => 
      link.classification === 'TOP_SECRET' ? NODE_COLORS.CLASSIFIED : '#999999',
    onNodeClick: handleNodeClick,
    onZoom: handleZoom
  }), [graphConfig, handleNodeClick, handleZoom]);

  return (
    <div className="network-graph-container" style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        {...graphConfiguration}
        enableNodeDrag={false} // Disable node dragging for security
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
};

export default NetworkGraph;