// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   /* config options here */
// };

// export default nextConfig;


// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // 本番ビルドでESLintエラーがあっても落とさない
    ignoreDuringBuilds: true,
  },
  // TypeScript型エラーでも落ちる場合は、必要なときだけ下をON
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
}
module.exports = nextConfig
