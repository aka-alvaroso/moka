import type { MeshConfig } from '@mockup-forge/shared';

// Pure CSS serialisation of a mesh-gradient background. Lives in its own module
// (no React) so both the renderer/layout code and the editor UI share one
// definition, and so it can be unit-tested without importing React.
export function meshToCss(mesh: MeshConfig): string {
  const layers = mesh.blobs.map((b) => {
    const r = parseInt(b.color.slice(1, 3), 16);
    const g = parseInt(b.color.slice(3, 5), 16);
    const bv = parseInt(b.color.slice(5, 7), 16);
    return `radial-gradient(circle at ${b.x}% ${b.y}%, rgba(${r},${g},${bv},${b.opacity}) 0%, transparent ${b.size}%)`;
  });
  return [...layers, mesh.base].join(', ');
}
