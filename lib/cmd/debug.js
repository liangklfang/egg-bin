'use strict';

const Command = require('./dev');
const cp = require('child_process');
const chalk = require('chalk');
const InspectorProxy = require('inspector-proxy');
const debug = require('debug')('egg-bin');

class DebugCommand extends Command {
  constructor(rawArgv) {
    super(rawArgv);
    // egg-bin debug --debug-port=6666 --agent=5555 --brk --agent-brk
    this.usage = 'Usage: egg-bin debug [dir] [options]';
    this.options = {
      debug: {
        alias: 'inspect',
        description: 'auto detect the protocol used by the targeted runtime, use inspect at 8.x+',
      },
      'debug-port': {
        description: 'worker debug port, default to 9229(inspect) or 5858(debug)',
      },
      'debug-brk': {
        alias: 'brk',
        description: 'whether stop at the top of worker initial script',
      },
      'debug-agent': {
        description: 'whether debug agent, could pass Number as debugPort, default to 9227(inspect) or 5856(debug)',
      },
      'debug-agent-brk': {
        description: 'whether stop at the top of agent initial script',
      },
    };
  }

  get description() {
    return 'Start server at local debug mode';
  }

  get context() {
    const context = super.context;
    const { argv, execArgvObj, debugOptions, debugPort } = context;

    // change real debug port
    argv.debug = debugPort || true;
    if (!argv.hasOwnProperty('debugAgent')) argv.debugAgent = true;

    if (debugOptions['inspect-brk'] || debugOptions['debug-brk']) {
      argv.debugBrk = true;
    }

    // remove unused
    argv['debug-port'] = undefined;
    argv['debug-brk'] = undefined;
    argv['debug-agent'] = undefined;
    argv['debug-agent-brk'] = undefined;

    // remove all debug options from execArgv
    for (const key of Object.keys(debugOptions)) {
      execArgvObj[key] = undefined;
    }

    // recreate execArgv array
    context.execArgv = this.helper.unparseArgv(execArgvObj);

    return context;
  }

  * run(context) {
    // change real debug port and start proxy
    const { argv, debugPort } = context;
    argv.debug = context.debugPort = debugPort + 100;
    const proxy = new InspectorProxy({ port: debugPort });

    const eggArgs = yield this.formatArgs(context);
    const options = {
      execArgv: context.execArgv,
      env: Object.assign({ NODE_ENV: 'development', EGG_DEBUG: true }, context.env),
    };
    debug('%s %j %j, %j', this.serverBin, eggArgs, options.execArgv, options.env.NODE_ENV);



    // start egg
    const child = cp.fork(this.serverBin, eggArgs, options);

    // start debug proxy
    let isFirst = true;
    proxy.start({ debugPort: context.debugPort });

    // proxy to new worker
    child.on('message', msg => {
      if (msg && msg.action === 'debug' && msg.from === 'app') {
        const { debugPort, pid } = msg.data;
        debug(`recieve new worker#${pid} debugPort: ${debugPort}`);

        proxy.start({ debugPort });
        if (isFirst) {
          isFirst = false;
          console.warn(chalk.yellow(`DevTools → ${proxy.url}`));
        }
      }
    });

    child.on('exit', () => proxy.end());
  }
}

module.exports = DebugCommand;
