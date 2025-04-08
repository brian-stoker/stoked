/**
 * Interface for LLM service implementations
 */
export interface LLMService {
  /**
   * Initialize the LLM service
   * @returns A promise that resolves to true if initialization is successful
   */
  initialize(): Promise<boolean>;

  /**
   * Check if the LLM service is ready to use
   * @returns True if the service is ready
   */
  isReady(): boolean;

  /**
   * Generate a text completion from a prompt
   * @param prompt The prompt text
   * @returns A promise that resolves to the generated completion
   */
  generateCompletion(prompt: string): Promise<string>;

  /**
   * Generate a completion from a prompt with streaming output
   * @param prompt The prompt text
   * @param callback Callback function that receives each chunk of the response
   */
  generateCompletionStream(prompt: string, callback: (text: string) => void): Promise<void>;

  /**
   * Get the name of the service
   * @returns The service name
   */
  getName(): string;
} 