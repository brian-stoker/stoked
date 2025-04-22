export const packageClassificationPrompt = (args:{packageJson: string, fileStructure: string[], codeSnippets: Record<string, string>}) => `
You are an expert software project analyst. Given the source code and metadata for a Node.js-based project, your task is to classify the project into one of the following types:

- Backend Application (e.g., REST API, GraphQL server)
- Frontend Library (e.g., React/Vue components)
- Utility Library (e.g., Lodash-style helpers)
- CLI Tool
- Machine Learning/Data Pipeline
- Cloud/Infrastructure SDK
- Mobile-focused Package

Here is the input context to use to determine your classification:

{
  "package.json": ${args.packageJson},
  "file_structure": "${args.fileStructure}",
  "code_snippets": ${JSON.stringify(args.codeSnippets, null, 2)}
}

Classification options: 'backend' | 'frontend' | 'utility' | 'cli' | 'ml' | 'sdk' | 'mobile' | 'other'

Respond with ONLY the following JSON structure (no explanations or other text):

{
  "classification": "<one of the classification actions listed above>",
  "reasoning": "<brief reasoning>",
  "confidence": "<low | medium | high>"
}`