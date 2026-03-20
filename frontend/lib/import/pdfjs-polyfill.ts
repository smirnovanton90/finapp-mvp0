/**
 * pdfjs-dist 4.x использует Promise.withResolvers() (ES2024).
 * В старых браузерах и в части встроенных WebView метод отсутствует — импорт этого файла
 * должен быть первым перед любым `import … from "pdfjs-dist"`.
 */

type WithResolversResult<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type WithResolversFn = <T>() => WithResolversResult<T>;

function patchPromiseWithResolvers(): void {
  if (typeof Promise === "undefined") return;
  const P = Promise as unknown as { withResolvers?: WithResolversFn };
  if (typeof P.withResolvers === "function") return;
  (P as { withResolvers: WithResolversFn }).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

patchPromiseWithResolvers();
