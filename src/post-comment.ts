import { config } from 'dotenv';
import { Octokit } from '@octokit/rest';

// Load environment variables first
config();

// Initialize Octokit after environment variables are loaded
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  baseUrl: 'https://api.github.com',
  userAgent: 'stoked-app'
});

console.log('GitHub Token:', process.env.GITHUB_TOKEN ? 'Present' : 'Missing');

const postComment = async (owner: string, repo: string, issue_number: number, commentBody: string) => {
  try {
    const result = await octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body: commentBody
    });
    console.log("Comment posted successfully:", result.data.url);
  } catch (error) {
    console.error("Error posting comment:", error);
    throw error;
  }
}

// Run the function
(async () => {
  try {
    await postComment("stoked-ui", "sui", 57, "This is a test comment from the updated script.");
  } catch (error) {
    console.error("Failed to post comment:", error);
    process.exit(1);
  }
})();