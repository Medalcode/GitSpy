const { exec } = require('child_process')

function noopScaler() {
  return {
    async scaleTo(replicas) {
      console.log('[noopScaler] scaleTo', replicas)
      return Promise.resolve()
    },
    async getCurrent() { return null }
  }
}

function k8sScaler(opts) {
  const deployment = opts.deployment
  const namespace = opts.namespace
  function nsArg() { return namespace ? `-n ${namespace}` : '' }

  return {
    async scaleTo(replicas) {
      return new Promise((resolve, reject) => {
        const cmd = `kubectl scale deployment ${deployment} --replicas=${replicas} ${nsArg()}`
        console.log('[k8sScaler] exec:', cmd)
        exec(cmd, (err, stdout, stderr) => {
          if (err) return reject(err)
          console.log(stdout || stderr)
          resolve()
        })
      })
    },
    async getCurrent() {
      return new Promise((resolve, reject) => {
        const cmd = `kubectl get deployment ${deployment} ${nsArg()} -o jsonpath='{.spec.replicas}'`
        exec(cmd, (err, stdout, stderr) => {
          if (err) return reject(err)
          const v = parseInt(stdout.replace(/'/g, '').trim() || '0', 10)
          resolve(isNaN(v) ? null : v)
        })
      })
    }
  }
}

function scriptScaler(opts) {
  const script = opts.script
  return {
    async scaleTo(replicas) {
      return new Promise((resolve, reject) => {
        const cmd = `${script} ${replicas}`
        console.log('[scriptScaler] exec:', cmd)
        exec(cmd, (err, stdout, stderr) => {
          if (err) return reject(err)
          console.log(stdout || stderr)
          resolve()
        })
      })
    },
    async getCurrent() { return null }
  }
}

module.exports = { noopScaler, k8sScaler, scriptScaler }
