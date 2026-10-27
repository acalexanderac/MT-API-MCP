/** Modern Treasury style API error: `{ errors: {...}, error_list: [...] }`. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {{code:string,message:string,parameter?:string}[]} errors
   */
  constructor(status, errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(list[0]?.message || 'request failed');
    this.name = 'ApiError';
    this.status = status;
    this.errorList = list.map((e) => ({
      code: e.code,
      message: e.message,
      ...(e.parameter ? { parameter: e.parameter } : {}),
    }));
  }

  body() {
    return { errors: this.errorList[0], error_list: this.errorList };
  }
}

export const notFound = (parameter = 'id', message = "Resource couldn't be found") =>
  new ApiError(404, { code: 'resource_not_found', message, parameter });

export const parameterInvalid = (parameter, message) =>
  new ApiError(400, { code: 'parameter_invalid', message, parameter });

export const parameterMissing = (parameter, message) =>
  new ApiError(422, {
    code: 'parameter_missing',
    message: message || `${parameter} is required`,
    parameter,
  });

export const invalidKey = (message = 'Invalid API key') =>
  new ApiError(401, { code: 'invalid_key', message });

export const headerInvalid = (message, parameter) =>
  new ApiError(400, { code: 'header_invalid', message, parameter });

export const forbidden = (message = 'Forbidden') =>
  new ApiError(403, { code: 'forbidden', message });

export const conflict = (message, parameter) =>
  new ApiError(409, { code: 'conflict', message, parameter });

export const tooManyRequests = (message = 'Too many requests') =>
  new ApiError(429, { code: 'too_many_requests', message });

/** Express error handler that renders ApiError (and anything else) as JSON. */
export function errorHandler(logger) {
  return (err, req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json(err.body());
    }
    if (err?.type === 'entity.parse.failed') {
      const api = parameterInvalid('body', 'Request body is not valid JSON');
      return res.status(api.status).json(api.body());
    }
    if (err?.type === 'entity.too.large') {
      const api = new ApiError(413, {
        code: 'parameter_invalid',
        message: 'Request exceeds the maximum supported size (25 MB)',
        parameter: 'body',
      });
      return res.status(api.status).json(api.body());
    }
    logger?.error?.(err);
    return res.status(500).json({
      errors: { code: 'internal_server_error', message: 'Internal server error' },
      error_list: [{ code: 'internal_server_error', message: 'Internal server error' }],
    });
  };
}
