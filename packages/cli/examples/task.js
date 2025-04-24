let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

let today = new Date();
today.setDate(today.getDate());
today = today.toISOString();

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
          processResults: ($response) => {
            return $response.filter((event) => {
              const eventDate = new Date(event.created_at).toISOString().split("T")[0];
              return eventDate === formattedYesterday;
            });
          }
        },
      },{
        activities: {
          type: "fetch",
          url: "http://arrakis:5600/api/0/query/",
          method: "POST",
          body: {
            "query": [
              "afk_events = query_bucket(find_bucket(\"aw-watcher-afk_\"));",
              "window_events = query_bucket(find_bucket(\"aw-watcher-window_\"));",
              "window_events = filter_period_intersect(window_events, filter_keyvals(afk_events, \"status\", [\"not-afk\"]));",
              "merged_events = merge_events_by_keys(window_events, [\"app\", \"title\"]);",
              "merged_events = categorize(merged_events, [[[\"Work\"],{\"regex\":\"Google Docs|libreoffice|ReText\",\"type\":\"regex\"}],[[\"Work\",\"Programming\"],{\"regex\":\"GitHub|Stack Overflow|BitBucket|Gitlab|vim|Spyder|kate|Ghidra|Scite\",\"type\":\"regex\"}],[[\"Work\",\"Programming\",\"ActivityWatch\"],{\"ignore_case\":true,\"regex\":\"ActivityWatch|aw-\",\"type\":\"regex\"}],[[\"Work\",\"Image\"],{\"regex\":\"GIMP|Inkscape\",\"type\":\"regex\"}],[[\"Work\",\"Video\"],{\"regex\":\"Kdenlive\",\"type\":\"regex\"}],[[\"Work\",\"Audio\"],{\"regex\":\"Audacity\",\"type\":\"regex\"}],[[\"Work\",\"3D\"],{\"regex\":\"Blender\",\"type\":\"regex\"}],[[\"Media\"],{\"type\":\"none\"}],[[\"Media\",\"Games\"],{\"regex\":\"Minecraft|RimWorld\",\"type\":\"regex\"}],[[\"Media\",\"Video\"],{\"regex\":\"YouTube|Plex|VLC\",\"type\":\"regex\"}],[[\"Media\",\"Social Media\"],{\"ignore_case\":true,\"regex\":\"reddit|Facebook|Twitter|Instagram|devRant\",\"type\":\"regex\"}],[[\"Media\",\"Music\"],{\"ignore_case\":true,\"regex\":\"Spotify|Deezer\",\"type\":\"regex\"}],[[\"Comms\"],{\"type\":\"none\"}],[[\"Comms\",\"IM\"],{\"regex\":\"Messenger|Telegram|Signal|WhatsApp|Rambox|Slack|Riot|Element|Discord|Nheko|NeoChat|Mattermost\",\"type\":\"regex\"}],[[\"Comms\",\"Email\"],{\"regex\":\"Gmail|Thunderbird|mutt|alpine\",\"type\":\"regex\"}],[[\"Uncategorized\"],{\"type\":\"none\"}],[[\"Stoked Consulting\"],{\"type\":\"none\"}],[[\"Stoked Consulting\",\"billable\"],{\"type\":\"none\"}],[[\"Stoked Consulting\",\"internal\"],{\"type\":\"none\"}],[[\"New class\"],{\"regex\":\"FILL ME\",\"type\":\"regex\"}],[[\"Stoked Consulting\",\"internal\",\"stoked\"],{\"regex\":\"stoked\",\"type\":\"regex\"}]]);",
              "merged_events = filter_keyvals(merged_events, \"category\", [\"Exclude\"], false);",
              "RETURN = sort_by_duration(merged_events);",
              ";"
            ],
            "timeperiods": [
              "${yesterday}/${today}"
            ]
          }
        }
      }
    ],
    prompt: `You are a software engineer with 25 years of experience. 
Given the github events and the activity watch data from your computer you will create a daily public post for your personal website documenting your activities for the day. The post does not have to include everything you worked on, although doing so at a high level is fine. . 

Here are your github events:

[inputs.events]

Here are your daily computer activities from activity watch:

[inputs.activities]

Respond with ONLY the following markdown structure (no explanations or other text):

---
title: '[Daily Post Title]'
description: '[Description for post]'
date: '${today}'
authors: [ 'brian-stoker' ]
tags: ['brianstoker.com', '.plan', 'brian-stoker']
manualCard: true
---

[Post content here in markdown]
`,
    outputs: [{
      type: "fetch",
      url: "https://brianstoker.com/api/.plan/",
      method: "POST",
      body: '$llmResponse'
    }],
  }],
} 