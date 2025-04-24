# Schedule Module

The Schedule module allows you to run prompts on a recurring schedule using your operating system's native scheduler. This means the CLI doesn't need to be continuously running for scheduled prompts to execute.

## Supported Platforms

- Linux (uses crontab)
- macOS (uses launchd)
- Windows (uses Task Scheduler)

## Usage

### Schedule a Prompt

Basic syntax:
```
stoked schedule [job-name] <cron expression> <prompt file(s)>
```

The command accepts:
- An optional job name for easier identification
- A standard cron expression (5 fields)
- One or more prompt files (text, JSON, or YAML)

#### Single Prompt Example

```
stoked schedule 0 0 * * * ./run_everyday_at_midnight.txt
```

This will run the prompt in `run_everyday_at_midnight.txt` every day at midnight.

#### Multiple Sequential Prompts Example

You can provide multiple text files to run them in sequence:

```
stoked schedule nightly-tasks 0 0 * * * ./task1.txt ./task2.txt ./task3.txt
```

This will run all three tasks in order every day at midnight.

#### JSON Task Format

You can define multiple tasks in a JSON file:

```
stoked schedule reporting-job 0 9 * * 1-5 ./weekday_tasks.json
```

Where `weekday_tasks.json` contains:

```json
{
  "tasks": [
    {
      "name": "build tech updates email",
      "prompt": "create a reading list for any new technology news that seems relevant to me and send me an email with the list"
    },
    {
      "name": "schedule prep",
      "prompt": "read my schedule for the next 3 days and give me a list of things that i should prepare for today in order to have successful tasks"
    }
  ]
}
```

#### YAML Task Format

You can also use YAML for defining tasks:

```
stoked schedule reporting-job 0 9 * * 1-5 ./weekday_tasks.yml
```

Where `weekday_tasks.yml` contains:

```yaml
---
tasks:
- name: build tech updates email
  prompt: create a reading list for any new technology news that seems relevant to
    me and send me an email with the list
- name: schedule prep
  prompt: read my schedule for the next 3 days and give me a list of things that i
    should prepare for today in order to have successful tasks
```

#### Advanced Task Configuration with Inputs and Outputs

You can define inputs for tasks and outputs that can be referenced by subsequent tasks:

```json
{
  "tasks": [
    {
      "name": "news-collector",
      "prompt": "create a reading list for any new technology news that seems relevant to me",
      "inputs": [
        {
          "url": "https://myfavoritetechnewssource.com"
        }
      ],
      "outputs": [
        {
          "techNewsContent": { "type": "text" }
        }
      ]
    },
    {
      "name": "email-formatter",
      "prompt": "format this technology news into an email",
      "inputs": [
        {
          "content": "$outputs.news-collector.techNewsContent"
        }
      ],
      "outputs": [
        {
          "formattedEmail": { "type": "email" }
        }
      ]
    }
  ]
}
```

In YAML format:

```yaml
---
tasks:
- name: news-collector
  prompt: create a reading list for any new technology news that seems relevant to me
  inputs:
  - url: https://myfavoritetechnewssource.com
  outputs:
  - techNewsContent:
      type: text
- name: email-formatter
  prompt: format this technology news into an email
  inputs:
  - content: $outputs.news-collector.techNewsContent
  outputs:
  - formattedEmail:
      type: email
```

In this example:
- The first task collects news and outputs it as `techNewsContent`
- The second task references that output using `$outputs.news-collector.techNewsContent` 

Inputs will be added to the prompt automatically, and outputs are extracted from the LLM's response. All outputs are stored in a JSON file in the same directory as the task file.

### List Scheduled Jobs

```
stoked schedule --list
```

This will show all currently scheduled jobs.

### Remove a Scheduled Job

```
stoked schedule --remove <job name>
```

This will remove the specified scheduled job.

## Cron Expression Format

The cron expression format is:

```
minute hour day-of-month month day-of-week
```

Examples:
- `0 0 * * *` - Every day at midnight
- `*/15 * * * *` - Every 15 minutes
- `0 9 * * 1-5` - Every weekday at 9 AM
- `0 0 1 * *` - First day of each month at midnight

## Implementation Details

The scheduler uses:
- Linux: crontab 
- macOS: launchd via plist files in ~/Library/LaunchAgents
- Windows: Task Scheduler

Tasks are stored in `~/.stoked/tasks/` directory and executed using the globally installed stoked CLI.

### Task Outputs

After tasks execute, a JSON file with outputs from all tasks is saved in the same directory as the task file with `_outputs.json` appended to the filename.

Deep Ocean (Cool, Aquatic Tones) 🌊
  Verbose: #CCF2FF (Pale Cyan)
  Debug: #99E6FF (Sky Blue)
  Info: #66D9FF (Bright Aqua)
  Warn: #33B5E5 (Deep Teal)
  Error: #0077B6 (Dark Blue)
  Fatal: #00334D (Navy Black)