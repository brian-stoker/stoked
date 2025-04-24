/**
 * Example task definition for the stoked schedule instant command
 * 
 * To run this task:
 * stoked schedule instant ./examples/task.ts
 */

export default {
  tasks: [
    {
      name: "summarize-repository",
      prompt: `You are a helpful AI assistant that summarizes codebases.
Please analyze the current repository and provide a brief summary of:
1. What type of project this is
2. The main components/modules
3. Key functionalities
4. Technologies used

Keep your response under 300 words.`
    },
    {
      name: "suggest-improvements",
      prompt: `Based on what you know about the codebase, suggest 3-5 potential improvements that could be made to the project structure, code organization, or architecture.

For each suggestion, provide:
1. A clear title for the improvement
2. A brief explanation of the benefit
3. A simple example or code snippet if applicable

$outputs.summarize-repository`,
      inputs: [
        {
          previousOutput: "$outputs.summarize-repository"
        }
      ],
      outputs: [
        {
          suggestions: "$llmResponse"
        }
      ]
    }
  ]
}; 