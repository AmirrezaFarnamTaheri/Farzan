# OpenCourseDeck Plugin System Plan

## Goal

OpenCourseDeck should support user-installed extensions without weakening the local-first privacy model, CSP posture, route lifecycle discipline, or backup/export guarantees already established in the unified audit. The plugin system must begin as a conservative capability platform, not as arbitrary code execution inside the main app.

The first production target is a **local plugin registry** that can install, enable, disable, inspect, export, and remove plugins. Plugins should be able to add focused behavior such as dashboard widgets, note actions, command-palette commands, import/export adapters, Studio tools, and AI provider connectors.

## Non-Goals

- No raw in-page `eval`.
- No plugins with ambient access to `window`, IndexedDB, localStorage, DOM, credentials, or route internals.
- No silent network access.
- No hidden autostart behavior outside the declared manifest lifecycle.
- No plugin install from arbitrary remote URLs until manifest signing and permission review exist.

## Plugin Package Shape

A plugin is a folder or ZIP archive with:

```text
opencoursedeck-plugin.json
main.js
README.md
assets/
```

The manifest is mandatory:

```json
{
  "id": "com.example.note-cleaner",
  "name": "Note Cleaner",
  "version": "1.0.0",
  "description": "Adds a safe note-formatting action.",
  "author": "Example",
  "entry": "main.js",
  "type": "worker",
  "permissions": ["notes:read", "notes:write", "commands:register"],
  "extensionPoints": ["command", "noteAction"],
  "network": {
    "allowedOrigins": []
  }
}
```

Required manifest rules:

- `id` must be stable, reverse-DNS style, ASCII, and unique.
- `version` must be semver.
- `entry` must resolve inside the plugin package.
- `permissions` must be explicit and shown before enabling.
- `network.allowedOrigins` must be empty unless the user explicitly approves each origin.

## Extension Points

Phase 1 extension points should be declarative and app-owned:

- `command`: add command-palette commands.
- `noteAction`: add actions that receive sanitized note snapshots and return patches.
- `dashboardWidget`: render app-owned widget layouts from a JSON view model.
- `importer`: parse a user-selected file into validated OpenCourseDeck records.
- `exporter`: create a file from validated OpenCourseDeck records.

Phase 2 extension points can add worker-backed scripting:

- `aiProvider`: register a local or user-keyed AI provider behind `OpenCourseDeck.AI`.
- `studioTool`: transform selected Studio elements through a constrained tool API.
- `courseMetadata`: enrich course/topic metadata without mutating catalog source files directly.

Phase 3 extension points can add richer UI:

- route-adjacent side panels rendered through a constrained component schema.
- user-defined dashboard layouts.
- plugin settings forms generated from JSON schema.

## Permission Model

Permissions should map to narrow host APIs:

- `notes:read`
- `notes:write`
- `courses:read`
- `progress:read`
- `progress:write`
- `media:read`
- `studio:read`
- `studio:write`
- `ai:provider`
- `network:<origin>`
- `files:import`
- `files:export`
- `commands:register`
- `widgets:register`

The app must deny any host API call not granted by the manifest and enabled by the user. Permission grants should be stored in a dedicated plugin settings record and included in vault exports.

## Runtime Isolation

Phase 1 plugins should be **data-only/declarative** whenever possible.

Phase 2 plugin code should run in a dedicated Web Worker:

- no DOM access
- no direct storage access
- no direct app globals
- message-based host API calls only
- per-plugin timeout and cancellation
- structured-clone-only payloads
- all returned HTML treated as untrusted and sanitized or rendered as text/schema

The desktop wrapper can later expose stronger native plugin features, but only through the same permission broker.

## Host API Boundary

The plugin host should expose a small broker:

```js
PluginHost.install(fileOrDirectory)
PluginHost.enable(pluginId)
PluginHost.disable(pluginId)
PluginHost.uninstall(pluginId)
PluginHost.list()
PluginHost.invoke(pluginId, extensionPoint, payload)
PluginHost.registerExtension(pluginId, descriptor)
```

Worker plugins should talk to the host through messages:

```js
postMessage({
  type: "opencoursedeck:plugin-ready",
  extensions: [
    { type: "command", id: "clean-note", title: "Clean current note" }
  ]
});
```

Host-to-plugin invocation:

```js
postMessage({
  type: "opencoursedeck:invoke",
  invocationId: "inv-123",
  extensionPoint: "noteAction",
  payload: {
    note: { id: "note-1", title: "Draft", text: "..." }
  }
});
```

Plugin response:

```js
postMessage({
  type: "opencoursedeck:result",
  invocationId: "inv-123",
  patch: {
    content: "<p>Sanitized by host before save.</p>"
  }
});
```

## Storage

Plugin metadata should use these canonical settings:

- `plasma-plugins-registry`: installed plugin metadata, enabled state, permissions, package hashes.
- `plasma-plugin-settings:<pluginId>`: plugin-specific settings.
- `plasma-plugin-data:<pluginId>`: plugin-specific local data, quota-limited.

Vault exports should include plugin registry metadata and plugin settings by default, but plugin private data should require an explicit export option if it can be large or sensitive.

## Security Review Checklist

Every plugin install should validate:

- manifest JSON schema
- plugin id/version format
- all files remain inside the package boundary
- entry file exists
- no unsupported permissions
- no undeclared network origins
- package size limit
- file count limit
- SHA-256 package hash

Every plugin invocation should enforce:

- timeout
- cancellation
- permission checks
- sanitized output
- size limits on returned payloads
- no direct object references to live app state

## UI Plan

Add a Settings subpanel called **Extensions**:

- installed plugins list
- enable/disable toggle
- permission summary
- package hash
- install from local ZIP/folder
- export plugin settings
- remove plugin
- per-plugin settings generated from schema

Add a plugin details view:

- manifest metadata
- extension points
- permissions
- network origins
- storage usage
- last error
- reset plugin data

## Implementation Phases

### Phase 1: Manifest and Registry

- Add manifest parser and validator.
- Add plugin registry storage.
- Add install/remove/enable/disable flows for local plugin packages.
- Add Settings Extensions panel.
- Add tests for manifest validation, permission display, and registry persistence.

### Phase 2: Declarative Extensions

- Add command and note-action extension descriptors.
- Let plugins contribute commands that call app-owned actions.
- Let note actions return validated note patches.
- Add tests for disabled plugins, missing permissions, and sanitized patches.

### Phase 3: Worker Runtime

- Add worker loader with timeout/cancel.
- Add message protocol.
- Add permission broker.
- Add network-origin enforcement for plugin fetch requests.
- Add tests for worker lifecycle, blocked permissions, and failed plugins.

### Phase 4: AI Provider Plugins

- Let plugins register `aiProvider` adapters behind `OpenCourseDeck.AI.registerLocalProvider()`.
- Support local model adapters and user-keyed remote adapters.
- Keep provider UI under Settings AI options and plugin details.

### Phase 5: Studio and Dashboard Plugins

- Add schema-rendered dashboard widgets.
- Add constrained Studio tools for selected elements.
- Add plugin import/export adapters.

## First Useful Plugin Candidates

- Note Cleaner: normalize headings, spacing, and pasted note fragments.
- Markdown Importer: import Markdown folders into notes.
- Anki Exporter: export parsed Q/A notes into flashcard CSV.
- Local AI Provider: register an installed model runtime with `OpenCourseDeck.AI`.
- Studio Template Pack: add reusable board templates without changing core Studio code.

## Acceptance Criteria

The plugin system is ready for first release when:

- plugins can be installed and disabled without reloading the app
- no plugin code runs in the main window
- every capability is denied unless granted
- all plugin output is sanitized or schema-rendered
- plugin settings and registry data survive restart and export/import
- broken plugins fail closed with visible error state
- CI covers manifest validation, permission enforcement, worker isolation, and uninstall cleanup
