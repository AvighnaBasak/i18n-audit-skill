type Visitor = Partial<Record<string, (node: ASTNode, parent: ASTNode | null, ancestors: ASTNode[]) => void>>;

export interface ASTNode {
  type: string;
  [key: string]: unknown;
}

export function walkAST(
  node: ASTNode | null | undefined,
  visitor: Visitor,
  parent: ASTNode | null = null,
  ancestors: ASTNode[] = []
): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type !== 'string') return;

  const enter = visitor[node.type];
  if (enter) {
    enter(node, parent, ancestors);
  }

  const nextAncestors = [...ancestors, node];

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;

    const child = node[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof (item as ASTNode).type === 'string') {
          walkAST(item as ASTNode, visitor, node, nextAncestors);
        }
      }
    } else if (child && typeof child === 'object' && typeof (child as ASTNode).type === 'string') {
      walkAST(child as ASTNode, visitor, node, nextAncestors);
    }
  }
}
