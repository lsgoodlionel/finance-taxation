export const appConfig = {
  port: Number(process.env.PORT || 3100),
  dataDir: new URL("../../data/", import.meta.url)
};
