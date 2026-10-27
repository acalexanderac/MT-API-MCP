/**
 * Writes the endpoint catalog this server implements to docs/ENDPOINTS.md.
 *
 *   npm run catalog            # write the markdown file
 *   npm run catalog -- --json  # print the same data as JSON
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildRouteTable, loadSpec } from '../src/lib/spec.js';
import { classifyAll } from '../src/routes/classify.js';

const spec = loadSpec();
const descriptors = classifyAll(buildRouteTable(spec));

const handlerFor = (descriptor) => {
  if (descriptor.special) return 'special';
  if (descriptor.kind === 'collection' && descriptor.method === 'get') return 'list';
  if (descriptor.isCreate) return 'create';
  if (descriptor.isShow) return 'get';
  if (descriptor.isUpdate) return 'update';
  if (descriptor.isDelete) return 'delete';
  return descriptor.method;
};

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      descriptors.map((descriptor) => ({
        method: descriptor.method.toUpperCase(),
        path: descriptor.path,
        operation_id: descriptor.operationId,
        tag: descriptor.tag,
        summary: descriptor.summary,
        resource: descriptor.resource,
        kind: descriptor.kind,
        status: descriptor.successStatus,
        handler: handlerFor(descriptor),
      })),
      null,
      2
    )
  );
  process.exit(0);
}

const byTag = new Map();
for (const descriptor of descriptors) {
  if (!byTag.has(descriptor.tag)) byTag.set(descriptor.tag, []);
  byTag.get(descriptor.tag).push(descriptor);
}

const paths = new Set(descriptors.map((descriptor) => descriptor.path));
const resources = new Set(
  descriptors.filter((descriptor) => !descriptor.special).map((d) => d.resource)
);

const lines = [
  '# Endpoint catalog',
  '',
  `Generated from \`spec/mt_openapi_spec_v1.yaml\` by \`npm run catalog\`.`,
  '',
  `- **${descriptors.length}** operations across **${paths.size}** paths`,
  `- **${byTag.size}** API groups, **${resources.size}** stored collections`,
  `- **${descriptors.filter((d) => d.special).length}** operations have purpose-written handlers; the rest are driven generically from the specification`,
  '',
  '`handler` says how the operation is served: `list`/`get`/`create`/`update`/`delete` are the',
  'generic spec-driven handlers, `special` means a named handler in `src/routes/special.js`.',
  '',
];

for (const [tag, routes] of [...byTag.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`## ${tag} (${routes.length})`, '');
  lines.push('| Method | Path | Operation | Status | Handler |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const route of routes) {
    lines.push(
      `| ${route.method.toUpperCase()} | \`${route.path}\` | ${route.operationId} | ${route.successStatus} | ${handlerFor(route)} |`
    );
  }
  lines.push('');
}

const target = path.join(process.cwd(), 'docs', 'ENDPOINTS.md');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${lines.join('\n')}\n`);

console.log(
  `wrote ${path.relative(process.cwd(), target)} — ` +
    `${descriptors.length} operations, ${paths.size} paths, ${byTag.size} groups`
);
