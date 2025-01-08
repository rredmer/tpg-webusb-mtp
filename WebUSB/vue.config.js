const fs = require('fs')
const path = require('path')

module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  devServer: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'server.key')),
      cert: fs.readFileSync(path.resolve(__dirname, 'cert.pem')),
    },
    disableHostCheck: true,
    public: 'https://kubernetes.docker.internal:8080/'
  }
};