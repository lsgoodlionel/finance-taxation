# V4 Ops Source Samples

These sample payloads demonstrate the JSON shape expected by `npm run v4:ops:record`.

Import examples:

```bash
npm run v4:ops:record -- backup-restore --input docs/v4/examples/ops-source-samples/backup-drill.json
npm run v4:ops:record -- connectors --input docs/v4/examples/ops-source-samples/connector-certification.json
npm run v4:ops:record -- ai-evals --input docs/v4/examples/ops-source-samples/ai-evals.json
```

After import, run:

```bash
npm run v4:ops
npm run test:load
npm run test:backup-restore
npm run test:connectors
npm run test:ai-evals
```
