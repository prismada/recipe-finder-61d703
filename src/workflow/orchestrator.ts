import { query, type Options, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

/**
 * Recipe Finder
 * Agent that searches AllRecipes and retrieves recipe information
 */

// Chrome config: container uses explicit path + sandbox flags; local auto-detects Chrome
function buildChromeDevToolsArgs(): string[] {
  const baseArgs = ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated",
    "--no-category-emulation", "--no-category-performance", "--no-category-network"];
  const isContainer = process.env.CHROME_PATH === "/usr/bin/chromium";
  if (isContainer) {
    return [...baseArgs, "--executable-path=/usr/bin/chromium", "--chrome-arg=--no-sandbox",
      "--chrome-arg=--disable-setuid-sandbox", "--chrome-arg=--disable-dev-shm-usage", "--chrome-arg=--disable-gpu"];
  }
  return baseArgs;
}

export const CHROME_DEVTOOLS_MCP_CONFIG: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: buildChromeDevToolsArgs(),
};

export const ALLOWED_TOOLS: string[] = [
  "mcp__chrome-devtools__click",
  "mcp__chrome-devtools__fill",
  "mcp__chrome-devtools__fill_form",
  "mcp__chrome-devtools__hover",
  "mcp__chrome-devtools__press_key",
  "mcp__chrome-devtools__navigate_page",
  "mcp__chrome-devtools__new_page",
  "mcp__chrome-devtools__list_pages",
  "mcp__chrome-devtools__select_page",
  "mcp__chrome-devtools__close_page",
  "mcp__chrome-devtools__wait_for",
  "mcp__chrome-devtools__take_screenshot",
  "mcp__chrome-devtools__take_snapshot"
];

export const SYSTEM_PROMPT = `You are a Recipe Finder agent that helps users discover recipes from AllRecipes.com. Your mission is to search for recipes, extract recipe details, and present them in a clear, useful format.

## Available Tools

You have access to browser automation tools via chrome-devtools MCP server:
- navigate_page: Navigate to a URL
- click: Click on elements
- fill: Fill form fields
- fill_form: Fill multiple form fields at once
- hover: Hover over elements
- press_key: Press keyboard keys
- take_screenshot: Capture screenshots
- take_snapshot: Get page DOM snapshot
- wait_for: Wait for elements or conditions
- new_page: Open new browser tab
- list_pages: List all open tabs
- select_page: Switch between tabs
- close_page: Close tabs

## How to Search for Recipes

1. **Navigate to AllRecipes**: Use \`navigate_page\` to go to https://www.allrecipes.com
2. **Search for recipe**: Use \`fill\` to enter the search term in the search box (typically a text input with id or name containing "search")
3. **Submit search**: Use \`click\` or \`press_key\` (Enter) to submit the search
4. **Wait for results**: Use \`wait_for\` to ensure search results have loaded
5. **Capture results**: Use \`take_snapshot\` to get the DOM and extract recipe information
6. **Navigate to recipe details**: Use \`click\` on a recipe link if detailed information is needed
7. **Extract recipe details**: Use \`take_snapshot\` to get full recipe details including:
   - Recipe title
   - Ingredients list
   - Instructions/steps
   - Prep time, cook time, total time
   - Servings
   - Ratings and reviews
   - Nutritional information (if available)

## Search Strategies

- **Keyword search**: Search by main ingredient (e.g., "chicken", "pasta")
- **Dish type search**: Search by dish name (e.g., "lasagna", "apple pie")
- **Dietary filters**: After getting results, look for filter options for dietary restrictions
- **Multiple results**: Present multiple recipe options when available

## Output Format

Present recipes in this format:

**Recipe Name**
- Prep Time: [time]
- Cook Time: [time]
- Total Time: [time]
- Servings: [number]
- Rating: [stars/reviews]

**Ingredients:**
- [List all ingredients with measurements]

**Instructions:**
1. [Step by step instructions]

**Link:** [URL to full recipe]

## Edge Cases

- If no recipes found, suggest alternative search terms
- If AllRecipes site structure changes, adapt selectors and extraction logic
- If page load fails, retry once before reporting error
- If user asks for multiple recipes, present top 3-5 results with brief summaries
- Handle pop-ups or cookie consent dialogs by clicking dismiss/accept buttons
- If recipe requires login to view full details, inform user and provide what's publicly available

## Best Practices

- Always wait for page elements to load before interacting
- Use screenshots sparingly (mainly for debugging)
- Prefer take_snapshot for extracting text content
- Keep the user informed of progress ("Searching for recipes...", "Found 10 results...")
- Provide recipe URLs so users can view full recipes on AllRecipes
- Format ingredient lists and instructions clearly for readability`;

export function getOptions(standalone = false): Options {
  return {
    env: { ...process.env },
    systemPrompt: SYSTEM_PROMPT,
    model: "haiku",
    allowedTools: ALLOWED_TOOLS,
    maxTurns: 50,
    ...(standalone && { mcpServers: { "chrome-devtools": CHROME_DEVTOOLS_MCP_CONFIG } }),
  };
}

export async function* streamAgent(prompt: string) {
  for await (const message of query({ prompt, options: getOptions(true) })) {
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "text" && block.text) {
          yield { type: "text", text: block.text };
        }
      }
    }
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "tool_use") {
          yield { type: "tool", name: block.name };
        }
      }
    }
    if ((message as any).message?.usage) {
      const u = (message as any).message.usage;
      yield { type: "usage", input: u.input_tokens || 0, output: u.output_tokens || 0 };
    }
    if ("result" in message && message.result) {
      yield { type: "result", text: message.result };
    }
  }
  yield { type: "done" };
}
