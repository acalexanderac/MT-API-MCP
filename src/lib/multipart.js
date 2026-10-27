/**
 * Minimal `multipart/form-data` reader for document uploads.
 *
 * Document creation is the one catalog endpoint that takes a file rather than
 * JSON. The upload's bytes are not retained — only the field values and the
 * file metadata the `document.file` schema reports back.
 */
export function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) return {};
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`.trim();

  const fields = {};
  for (const section of buffer.toString('binary').split(boundary)) {
    const trimmed = section.replace(/^\r\n/, '');
    if (!trimmed || trimmed.startsWith('--')) continue;

    const split = trimmed.indexOf('\r\n\r\n');
    if (split === -1) continue;
    const rawHeaders = trimmed.slice(0, split);
    const body = trimmed.slice(split + 4).replace(/\r\n$/, '');

    const nameMatch = /name="([^"]*)"/i.exec(rawHeaders);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = /filename="([^"]*)"/i.exec(rawHeaders);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders);

    if (filenameMatch) {
      fields[name] = {
        filename: filenameMatch[1],
        content_type: (typeMatch?.[1] || 'application/octet-stream').trim(),
        size: Buffer.byteLength(body, 'binary'),
      };
    } else {
      fields[name] = body;
    }
  }
  return fields;
}

/** Express middleware: parse document uploads into `req.body`. */
export function multipartBody({ limit = 25 * 1024 * 1024 } = {}) {
  return (req, res, next) => {
    const contentType = req.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) return next();

    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > limit) {
        next(Object.assign(new Error('payload too large'), { type: 'entity.too.large' }));
        return;
      }
      req.body = parseMultipart(Buffer.concat(chunks), contentType);
      next();
    });
    req.on('error', next);
    return undefined;
  };
}
