import { createHttpClient, type AuthMode, type HttpClientOptions, type HttpMethod, type QueryParamValue } from "./http";
import type { paths } from "./generated";

type LowercaseMethod = "get" | "post" | "put" | "patch" | "delete";
type ApiPath = keyof paths;

type OperationFor<P extends ApiPath, M extends LowercaseMethod> = Exclude<paths[P][M], undefined | never>;
type OperationParameters<Op> = Op extends { parameters: infer Params } ? Params : never;
type OperationPathParams<Op> = OperationParameters<Op> extends { path?: infer Param } ? Param : never;
type OperationQueryParams<Op> = OperationParameters<Op> extends { query?: infer Param } ? Param : never;
type OperationRequestBody<Op> = Op extends { requestBody: { content: infer Content } }
  ? Content[keyof Content]
  : never;
type OperationResponses<Op> = Op extends { responses: infer Responses } ? Responses : never;
type SuccessStatusCode = 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208;
type JsonFromResponse<ResponseType> = ResponseType extends { content: infer Content }
  ? Content extends { "application/json": infer JsonPayload }
    ? JsonPayload
    : Content[keyof Content]
  : undefined;
type OperationResponse<Op> = JsonFromResponse<OperationResponses<Op>[Extract<keyof OperationResponses<Op>, SuccessStatusCode>]>;

type MethodsForPath<P extends ApiPath> = {
  [M in LowercaseMethod]: paths[P][M] extends undefined | never ? never : M;
}[LowercaseMethod];

type UppercaseMethodMap = {
  get: "GET";
  post: "POST";
  put: "PUT";
  patch: "PATCH";
  delete: "DELETE";
};

const methodMap: Record<LowercaseMethod, HttpMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};

export interface TypedRequestOptions<P extends ApiPath, M extends MethodsForPath<P>> {
  path: P;
  method: M;
  pathParams?: OperationPathParams<OperationFor<P, M>>;
  query?: OperationQueryParams<OperationFor<P, M>>;
  body?: OperationRequestBody<OperationFor<P, M>>;
  headers?: HeadersInit;
  auth?: AuthMode;
  signal?: AbortSignal;
  retryUnauthorized?: boolean;
}

export interface TypedApiClient {
  call<P extends ApiPath, M extends MethodsForPath<P>>(
    options: TypedRequestOptions<P, M>,
  ): Promise<OperationResponse<OperationFor<P, M>>>;
}

const interpolatePath = (pathTemplate: string, pathParams: unknown): string => {
  if (!pathParams || typeof pathParams !== "object") {
    return pathTemplate;
  }

  return Object.entries(pathParams as Record<string, unknown>).reduce((resolvedPath, [key, value]) => {
    return resolvedPath.replace(`{${key}}`, encodeURIComponent(String(value)));
  }, pathTemplate);
};

const toQueryRecord = (query: unknown): Record<string, QueryParamValue> | undefined => {
  if (!query || typeof query !== "object") {
    return undefined;
  }

  return query as Record<string, QueryParamValue>;
};

export const createTypedApiClient = (options: HttpClientOptions = {}): TypedApiClient => {
  const httpClient = createHttpClient(options);

  return {
    call: async <P extends ApiPath, M extends MethodsForPath<P>>(
      requestOptions: TypedRequestOptions<P, M>,
    ): Promise<OperationResponse<OperationFor<P, M>>> => {
      const resolvedPath = interpolatePath(requestOptions.path as string, requestOptions.pathParams);

      return httpClient.request<OperationResponse<OperationFor<P, M>>, TypedRequestOptions<P, M>["body"]>({
        path: resolvedPath,
        method: methodMap[requestOptions.method as LowercaseMethod] as UppercaseMethodMap[M],
        query: toQueryRecord(requestOptions.query),
        body: requestOptions.body,
        headers: requestOptions.headers,
        auth: requestOptions.auth,
        signal: requestOptions.signal,
        retryUnauthorized: requestOptions.retryUnauthorized,
      });
    },
  };
};
