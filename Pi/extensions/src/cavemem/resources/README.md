
# Cavemem extension resources

## `opencodeBridge.js` generation

This file is generated from the [cavemem](https://github.com/JuliusBrussee/cavemem) monorepo (`apps/cli`). It provides the bridge interface used by the cavemem extension.

### Setup & build

#### 1. Install dependencies

```sh
sudo npm install -g @xenova/transformers --allow-scripts=sharp,protobufjs

sudo npm install -g pnpm@latest-11
sudo pnpm setup
```

#### 2. Clone the cavemem repo

```sh
cd ~/workspace/github

git clone https://github.com/JuliusBrussee/cavemem.git

cd cavemem
```

#### 3. Patch `tsup.config.ts`

Edit `apps/cli/tsup.config.ts` to disable code splitting so `opencodeBridge.js` is a single self-contained file with all dependencies inlined:

```ts
export default defineConfig({
    // ...
    // Force opencodeBridge to be a single file with all deps inlined
    splitting: false,
});
```

#### 4. Build

```sh
# pnpm approve-builds --all
sudo pnpm install
sudo pnpm build
```

#### 5. Verify output

```sh
cat ./apps/cli/dist/opencodeBridge.js
```

#### 6. Copy to this directory

Copy the built `opencodeBridge.js` from `apps/cli/dist/` into this `resources/` directory.
