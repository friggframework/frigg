/**
 * Markdown-it plugin to convert GitBook syntax to VitePress-compatible format
 */

// Map GitBook hint styles to VitePress container types
const hintStyleMap = {
  'success': 'tip',
  'info': 'info',
  'warning': 'warning',
  'danger': 'danger',
  'tip': 'tip'
}

/**
 * Convert GitBook hint blocks to VitePress containers
 * {% hint style="success" %} -> ::: tip
 * {% endhint %} -> :::
 */
function convertHints(content) {
  // Convert opening hint tags
  content = content.replace(
    /\{%\s*hint\s+style="(\w+)"\s*%\}/gi,
    (match, style) => {
      const vpType = hintStyleMap[style.toLowerCase()] || 'info'
      return `::: ${vpType}`
    }
  )

  // Convert closing hint tags
  content = content.replace(/\{%\s*endhint\s*%\}/gi, ':::')

  return content
}

/**
 * Convert GitBook embed to markdown link
 * {% embed url="https://..." %}
 */
function convertEmbeds(content) {
  return content.replace(
    /\{%\s*embed\s+url="([^"]+)"\s*%\}/gi,
    (match, url) => `[View embedded content](${url})`
  )
}

/**
 * Convert GitBook content-ref to markdown link
 * {% content-ref url="..." %}
 * [link text](url)
 * {% endcontent-ref %}
 */
function convertContentRefs(content) {
  return content.replace(
    /\{%\s*content-ref\s+url="([^"]+)"\s*%\}\s*\[([^\]]*)\]\([^)]*\)\s*\{%\s*endcontent-ref\s*%\}/gi,
    (match, url, text) => `[${text || url}](${url})`
  )
}

/**
 * Convert GitBook swagger blocks to API reference links
 * {% swagger src="..." path="..." method="..." %}
 */
function convertSwagger(content) {
  return content.replace(
    /\{%\s*swagger\s+src="([^"]+)"\s+path="([^"]+)"\s+method="(\w+)"[^%]*%\}\s*\{%\s*endswagger\s*%\}/gi,
    (match, src, path, method) => {
      const methodUpper = method.toUpperCase()
      return `### \`${methodUpper} ${path}\`\n\nSee the [OpenAPI specification](${src}) for details.`
    }
  )
}

/**
 * Remove or convert GitBook-specific table attributes
 */
function cleanTableAttributes(content) {
  // Remove data-card and other GitBook table attributes
  return content.replace(
    /<table[^>]*data-[^>]*>/gi,
    '<table>'
  )
}

/**
 * Main transform function
 */
export function transformGitBookMarkdown(content) {
  content = convertHints(content)
  content = convertEmbeds(content)
  content = convertContentRefs(content)
  content = convertSwagger(content)
  content = cleanTableAttributes(content)
  return content
}

export default {
  transformGitBookMarkdown
}
