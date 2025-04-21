export const packageClassificationPrompt = (args:{packageJson: string, fileStructure: string[], codeSnippets: Record<string, string>}) => `
You are an expert software project analyst. Given the source code and metadata for a Node.js-based project, your task is to classify the project into one of the following types:

- Backend Application (e.g., REST API, GraphQL server)
- Frontend Library (e.g., React/Vue components)
- Utility Library (e.g., Lodash-style helpers)
- CLI Tool
- Machine Learning/Data Pipeline
- Cloud/Infrastructure SDK
- Mobile-focused Package

Return the most appropriate classification and briefly justify your reasoning based on the code and metadata provided.

Input context:

{
  "package.json": ${args.packageJson},
  "file_structure": ${args.fileStructure},
  "code_snippets": ${args.codeSnippets}
}

Output format:

{
  "classification": "<one of the above>",
  "reasoning": "<brief reasoning>",
  "confidence": "<low | medium | high>"
}`
  
