# Levered Agent CLI

The Levered Agent is a command-line tool that helps you integrate the Levered dynamic component system into your React codebase.

## Installation

The agent is part of the `levered-client` monorepo. After cloning the repository and running `npm install` in the root, you can link the agent to make it available globally.

```bash
# From the root of the monorepo
npm run build --workspace=@levered/agent
npm link --workspace=@levered/agent
```

Now you can run the `levered` command from any of your projects.

## Commands

### `levered init`

Initializes a new Levered project in the current directory. This creates:

- `levered.config.json`: A configuration file for your project's API keys and settings.
- `.levered/`: A directory for local state, such as codebase scans.

### `levered scan`

Scans your `src` directory. This command does two things:

1.  Builds a map of your project's component structure, storing the results in `.levered/memory.json`.
2.  Finds targetable UI elements (headings, paragraphs, spans, buttons) and injects a unique `data-levered-id` attribute into them. This prepares your codebase for granular element wrapping.

### `levered wrap [componentName]`

This is the main command to "lever" a piece of your UI. It can wrap either an entire component or a specific element within a component.

- **To wrap a component:** Provide the component's name.
- **To wrap an element:** Provide the `--id` of the element.

The agent finds the specified target, sends its source code to the Levered Component Service, and replaces the local code with the `<LeveredComponent>` placeholder from the SDK.

**Options:**

- `-f, --file <path>`: The path to the file containing the target. (Required only when wrapping a component by name).
- `--id <elementId>`: The ID of a specific element to wrap. When using this, `--file` is not needed.

**Examples:**

```bash
# Wrap an entire component (requires --file)
levered wrap MyButton --file src/components/MyButton.tsx

# Wrap a single element (does not require --file)
levered wrap --id a8b4e1c9f2
```

## Example Workflow

Here's a typical workflow for wrapping a specific UI element:

1.  **Navigate to your project's root directory and initialize Levered.**

    ```bash
    cd /path/to/your-react-app
    levered init
    ```

2.  **Scan your codebase.** The agent will analyze your files and automatically add `data-levered-id` attributes to elements like headings, buttons, etc.

    ```bash
    levered scan
    ```

3.  **Find your target element.** Run your application's development server. Open your browser, navigate to the page with the element you want to wrap, and use the browser's "Inspect Element" tool to find the element and copy its `data-levered-id`.

4.  **Wrap the element.** Use the `wrap` command with the `--id` you just copied. The agent will find the correct file automatically, register the element with the Levered service, and replace it with the placeholder.

    ```bash
    levered wrap --id a8b4e1c9f2
    ```

After these steps, the specific element in your local codebase will be replaced by `<LeveredComponent componentId="..." />`, and its original code will be managed by the Levered service.
