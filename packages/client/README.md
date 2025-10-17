# Levered Client SDK

The Levered Client SDK is a lightweight TypeScript library for React that allows you to dynamically render UI components from the Levered Component Service.

## Installation

```bash
npm install @levered/client
```

## Usage

### 1. Wrap your application with `LeveredProvider`

In your main application file (e.g., `App.tsx` or `main.tsx`), wrap your root component with the `LeveredProvider`. This provides the necessary context for the dynamic components to fetch their data.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LeveredProvider } from "@levered/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LeveredProvider
      publicKey="YOUR_PUBLIC_KEY"
      apiEndpoint="http://localhost:8000"
    >
      <App />
    </LeveredProvider>
  </React.StrictMode>
);
```

### 2. Use the `LeveredComponent` placeholder

In any component where you want to render a dynamic component, use the `LeveredComponent` placeholder and pass the unique `componentId`.

```tsx
// src/components/MyFeature.tsx
"use client"; // Required for Next.js App Router

import { LeveredComponent } from "@levered/client";

const MyFeature = () => {
  return (
    <div>
      <h1>My Awesome Feature</h1>
      <p>Here is a dynamically rendered component from Levered:</p>
      <LeveredComponent componentId="YOUR_COMPONENT_ID" />
    </div>
  );
};

export default MyFeature;
```

### Next.js Compatibility

To ensure compatibility with the Next.js App Router, any file that imports and uses `<LeveredComponent>` must be explicitly marked as a Client Component. You can do this by adding the `'use client'` directive at the very top of the file.

## Local Development & Testing

To test the SDK on a local project before it's published to npm, you should follow this workflow.

### 1. Build the SDK

Before you can link the package, you must build it. The `prepack` script added to `package.json` will handle this automatically when you run `npm link`, but you can also run it manually from the `packages/client` directory:

```bash
# From packages/client
npm run build
```

### 2. Link the SDK

From the root of the monorepo, run the `npm link` command for the client workspace. This creates a global symlink on your computer pointing to this package's directory.

```bash
# From the root of the monorepo
npm link --workspace=@levered/client
```

### 3. Use the Linked SDK

In the root directory of your local test application (e.g., a create-react-app or Next.js project), run the `npm link @levered/client` command. This creates a symlink in your test app's `node_modules` that points to the global symlink.

```bash
# From your test application's directory
npm link @levered/client
```

### Real-time Updates

Any changes you make to the SDK source code will now be immediately reflected in the test application after you rebuild the SDK and the test app refreshes.
