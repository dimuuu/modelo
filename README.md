# Modelo

Modelo is a local-first notebook where the story and the calculation model are the same document. You write prose, place model blocks between the paragraphs, and mention their values inline. Everything you can do by hand, an agent can do through native WebMCP tools.

**Live:** https://modelo.dmytro.fyi

## What it does

You can write prose with headings, paragraphs, and lists, as in any other rich-text editor. Between paragraphs, you can add model blocks: a number, slider, select, toggle, or formula. Each block declares a named variable.

Typing `@` in a paragraph inserts the value as an inline chip that reacts to model changes. This lets you build deterministic, interactive models and add a narrative around them. You can also create and save scenarios with predefined values to compare different outcomes.

Everything you can do manually is also available through WebMCP tools. An agent can list notebooks, open them, read a model, set an input by name, or rename a variable and update every formula that uses it. Each writing tool reports what changed, what remains broken, and how well the page reads.

Three notebooks ship on first run: AE compensation, founder runway, and rent against mortgage. Each one opens with saved scenarios to apply.

## Inspiration

Modelo is directly inspired by Decipad, a product I worked on in the past. At the time, LLMs were far less advanced, and few products had useful AI features. The project did not work out, but I always believed it was a great idea that needed agentic collaboration to feel complete. For this challenge, I rebuilt a minimal version of it.

## Run it

```bash
pnpm install
pnpm dev
```

Checks:

```bash
pnpm test     # vitest
pnpm check    # oxlint via ultracite
pnpm fix      # oxlint --fix and oxfmt --write
pnpm build    # tsc -b && vite build
```

## How it is built

Modelo uses React 19 and Vite, with no backend. BlockNote provides the editor and acts as the only source of truth. The document you see is the same document that the tools edit. MathJS evaluates the formula graph based on its dependencies, while Zod validates every argument at the boundary. The interface is Tailwind CSS and shadcn/ui on Base UI. Ultracite with oxlint and oxfmt handles linting and formatting.

WebMCP registration uses Chrome's `use-webmcp-tool` hook. A single table in `src/webmcp/tools.ts` defines all 23 tools: their names, scopes, Zod schemas, descriptions, and `run` functions. The React layer loops through the table and registers each tool with `document.modelContext.registerTool`. The interface buttons call the same `runTool` function that the agent uses.

## Using it with an agent

Use Chrome with `chrome://flags/#enable-webmcp-testing`, or ChatGPT's in-app browser. Modelo needs native `document.modelContext`. Without it the app stays fully usable; the tools simply do not register.

Every tool is registered all the time. A notebook tool called while no notebook is open returns `NO_NOTEBOOK_OPEN`, so an agent that listed the tools once always sees the same list.

Every call an agent makes is visible on the page: a small toast names the tool and the values that changed, and the blocks it touched flash.

Every tool argument is parsed with Zod before it reaches the document. A failure returns `{ ok: false, error: { code, message, details? } }` with no stack trace.

Try these against the AE compensation notebook:

1. "List the notebooks, open the AE compensation notebook, then summarize its model and any errors."
2. "Set `ClosedArr` to 1,050,000 and tell me the new earned commission and total cash compensation."
3. "Insert a formula named `VariablePayMultiple` equal to `EarnedCommission / TargetVariablePay`, then add a paragraph that references it."

To build a new model, ask the agent to write a section rather than to dump variables. An `@name` in a paragraph becomes a live reference.

## Challenges

Currency algebra was difficult. Registering each currency as a separate MathJS unit makes mixed-currency formulas return an error. In the future, I would like to add FX rates to support currency conversion. More generally, units require careful handling and many design decisions.

Agent-written prose was another challenge. By default, agents focus on building the model rather than creating a clear and visually appealing narrative. I added sections to the tool calls to improve this. A section is more than a set of blocks: its paragraphs can mention variables that do not exist yet. The section tool resolves `@names` against variables declared in the same call, so a sentence can reference a formula that appears later.

## What I learned

A tool should always report what it changed. Without this feedback, agents make more mistakes than they should. The mutation report became the most useful information an agent receives.

Tool descriptions are prompts. Two sentences explaining when to use `write_section` instead of `insert_blocks` changed agent behavior more than any schema did.

## What's next

Sharing notebooks by link, which will require a small backend. Charts as a block type, so users can see scenario comparisons as well as read them. Importing spreadsheet ranges as inputs. A richer unit system that can convert values instead of only formatting them.

## Browser data

Everything lives in this browser under the `modelo.workspace.v1` key. Which tabs are open lives in the URL instead. Export a notebook before you clear site data or change browser.

## License

MIT
