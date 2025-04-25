let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

let today = new Date();
today.setDate(today.getDate());
today = today.toISOString();
const processResults = ($response) => {
  return $response.filter((event) => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    console.log('eventDate, formattedYesterday', eventDate, formattedYesterday);
    return eventDate === formattedYesterday;
  });
};
export default {
  tasks: [{
    inputs: [
      {
        events: {
          type: "fetch",
          url: "https://api.github.com/users/brian-stoker/events",
          headers: [
            {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              "User-Agent": "GitHub-Event-Fetcher",
            },
          ],
          processResults
        },
      }
    ],
    prompt: `You are a software engineer with 25 years of experience. 
Given the github events and the activity watch data from your computer you will create a daily public post for your personal website documenting your activities for the day. The post should pick one or two key activites and describe what was accomplished it should NOT be a list of activities and events. Those are provided to give context. Items that should be replaced from the template are marked with <>.

Here are your github events:

[inputs.events]

${formattedYesterday}

Respond with ONLY the following markdown structure (no explanations or other text):

---
title: '<create a title for the post>'
description: '<create a description for this post>'
date: '${today}'
authors: [ 'brian-stoker' ]
tags: ['brianstoker.com', '.plan', 'brian-stoker']
manualCard: true
---

<Post content here in markdown>
`,
    outputs: [{
      type: "fetch",
      url: "https://brianstoker.com/api/.plan/",
      method: "POST",
      body: '$llmResponse'
    }],
  }],
} 