// Text embedded for each artifact. Shared by scripts/embed.mjs (build time) and kept in JS so Node can import it.

/**
 * @param {{type: string, name: string, plugin: string, description: string, trigger: string}} artifact
 * @param {{tags?: string[], keywords?: string[], category?: string | null} | undefined} plugin
 */
export function passageText(artifact, plugin) {
  const words = [...new Set([...(plugin?.tags ?? []), ...(plugin?.keywords ?? []), plugin?.category].filter(Boolean))];
  return [
    `${artifact.type} ${artifact.name.replace(/[-_:]/g, ' ')}.`,
    artifact.description,
    artifact.trigger ? `Use when ${artifact.trigger}` : '',
    `Plugin: ${artifact.plugin.replace(/-/g, ' ')}.`,
    words.length ? `Topics: ${words.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
