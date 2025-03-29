import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Node-RED Dashboard 2 UI Scheduler",
  description: "Official documentation for Node-RED Dashboard 2 UI Scheduler",
  base: '/node-red-dashboard-2-ui-scheduler/',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/Home' },
      { text: 'Features', link: '/Features' },
      { text: 'Installation', link: '/Installation' },
      { text: 'Usage', link: '/Usage' },
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Home', link: '/Home' },
          { text: 'Features', link: '/Features' },
          { text: 'Installation', link: '/Installation' },
          { text: 'Usage', link: '/Usage' },
          { text: 'Configuration', link: '/Configuration' },
          { text: 'Development', link: '/Development' },
          { text: 'API Examples', link: '/api-examples' },
          { text: 'Markdown Examples', link: '/markdown-examples' },
          { text: 'Acknowledgements', link: '/Acknowledgements' },
          { text: 'License', link: '/License' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cgjgh/node-red-dashboard-2-ui-scheduler' }
    ]
  }
})
