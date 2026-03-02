/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
  env: {
    CF_AUD_TAG: process.env.CF_AUD_TAG,
    CF_POLICY_ID: process.env.CF_POLICY_ID,
    CF_TEAM_DOMAIN: process.env.CF_TEAM_DOMAIN,
    INSTANCE_URL: process.env.INSTANCE_URL,
    RELAY_SECRET: process.env.RELAY_SECRET,
    GATEWAY_WS_URL: process.env.GATEWAY_WS_URL,
  },
}

module.exports = nextConfig
