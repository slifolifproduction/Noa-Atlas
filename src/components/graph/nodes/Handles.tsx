import { Handle, Position, useConnection } from '@xyflow/react';

/**
 * One visible source handle for drawing a connection, plus a target handle
 * that covers the whole node while a connection is being dragged, so a
 * relationship can be dropped anywhere on the node.
 */
export function NodeHandles({ side = Position.Right }: { side?: Position }) {
  const connection = useConnection();
  return (
    <>
      <Handle type="source" position={side} className="source-handle" aria-label="Drag to connect" />
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className={connection.inProgress ? 'target-handle' : 'opacity-0! pointer-events-none'}
      />
    </>
  );
}
