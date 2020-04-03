let express = require('express');
let encoding = require('text-encoding');
let nodeProcess = require('process');
let router = express.Router();
let {spawn, spawnSync} = require('child_process');
let fs = require("fs");

const processesFileName = "processes.json";

let registeredProcess = "";
fs.readFile(processesFileName, (err, data) => {
  if (err || data.length === 0) registeredProcess = JSON.parse("[]");
  else registeredProcess = JSON.parse(data);


  registeredProcess.map(it => {
    it.pid = null;
    it.is_running = false
  })
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

router.get('/processes', (req, res) => {
  res.json(registeredProcess)
});

router.post('/processes/create', (req, res) => {
  const nextProcessId = registeredProcess.map(it => it.id)
    .reduce((max, item) => {
      return max > item? max : item
    }, 0) + 1;


  const newProcess = {
    id: nextProcessId,
    type: 'jar',
    path: '',
    build_path: '',
    is_running: false,
    pid: null,
    name: ''
  };
  registeredProcess.push(newProcess);

  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess));
  res.json(registeredProcess)
});

router.delete('/processes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!!id === false) {
    res.status(400).send({error: `Process Id is required.`});
    return
  }

  const foundProcess = registeredProcess.find(it => it.id === id);
  if (typeof foundProcess == 'undefined') {
    res.status(400).send({error: `Process is not found. id(${id}).`});
    return
  }

  if (foundProcess.is_running === true) {
    res.status(400).send({error: `Process is running. id(${id}).`});
    return
  }
  registeredProcess = registeredProcess.filter(it => it.id !== id);

  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess));
  res.json(registeredProcess)
});


// 프로세스 실행 & 실행된 프로세스 정보 저장 & 로그 출력
router.get('/processes/run/:id', (req, res) => {
  let id = parseInt(req.params.id);
  let processType = req.query.type;
  let processPath = req.query.path;
  let processName = req.query.name;
  if (!!id === false || !!processType === false || !!processPath === false) {
    res.status(400).send({error: 'Id or Type or Path is required.'});
    return
  }

  let foundProcess = registeredProcess.find(it => it.id === id);
  if (typeof foundProcess === 'undefined') {
    res.status(400).send({error: `Process is not found. id(${id}).`});
    return
  }


  let newProcess = null;
  if (processType === 'jar') {
    newProcess = spawn(`java`, ['-jar', processPath, '&'], process.env)
  } else {
    newProcess = spawn('node', [processPath], {
      env: Object.assign({PORT: 2000}, process.env)
    })
  }

  newProcess.stdout.on('data', data => {
    nodeProcess.stdout.write(`${foundProcess.name}: ${new encoding.TextDecoder("utf-8").decode(data)}`)
  });

  newProcess.stderr.on('data', data => {
    nodeProcess.stdout.write(`${foundProcess.name}: ${new encoding.TextDecoder("utf-8").decode(data)}`)
  });

  newProcess.on('close', code => {
    nodeProcess.stdout.write(`child process exited with code ${code}\n`);
    foundProcess.pid = null;
    foundProcess.is_running = false;
  });

  foundProcess.pid = newProcess.pid;
  foundProcess.is_running = true;
  foundProcess.path = processPath;
  foundProcess.name = processName;

  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess))
  res.status(200).send(foundProcess)
});

router.get('/processes/build/:id', (req, res) => {
  let id = parseInt(req.params.id)
  let buildPath = req.query.build_path
  if (!!id == false || !!buildPath == false) {
    res.status(400).send({error: 'Id and Path are required.'})
    return
  }

  let foundProcess = registeredProcess.find(it => it.id === id)
  if (typeof foundProcess === 'undefined') {
    res.status(400).send({error: `Process is not found. id(${id}).`})
    return
  }

  const buildProcess = spawn(`${buildPath}/gradlew`, ['-p', `${buildPath}`, 'bootJar']);
  buildProcess.stdout.on('data', data => {
    nodeProcess.stdout.write(`${foundProcess.name}: ${new encoding.TextDecoder("utf-8").decode(data)}`)
  });

  buildProcess.stderr.on('data', data => {
    nodeProcess.stdout.write(`${foundProcess.name}: ${new encoding.TextDecoder("utf-8").decode(data)}`)
  });

  foundProcess.build_path = buildPath;
  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess))
  res.status(200).send(foundProcess)
});

// 프로세스 종료
router.get('/processes/kill/:pid', (req, res) => {
  const pid = parseInt(req.params.pid);
  if (typeof pid == 'undefined') {
    res.status(400).send({error: 'Pid path parameter is required.'})
    return
  }

  const foundProcess = registeredProcess.find(it => it.pid === pid);
  if (typeof foundProcess == 'undefined') {
    foundProcess.pid = null;
    foundProcess.is_running = false;
    res.status(400).send({error: `Process is not found. pid(${pid})`});
    return
  }

  process.kill(foundProcess.pid, 1);
  foundProcess.pid = null;
  foundProcess.is_running = false;

  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess));
  res.status(200).send({
    message: 'success'
  })
});

/**
 * git pull 관련
 */
router.get('/processes/git/pull/:id', (req, res)=>{
  let id = parseInt(req.params.id);
  let buildPath = req.query.build_path;
  if (!!id === false || !!buildPath === false) {
    res.status(400).send({error: 'Id and Path are required.'});
    return
  }
  let foundProcess = registeredProcess.find(it => it.id === id);
  if (typeof foundProcess === 'undefined') {
    res.status(400).send({error: `Process is not found. id(${id}).`});
    return
  }
  const pullProcess = spawnSync('git', ['-C', buildPath, 'pull', 'origin','--progress']);
  //Todo pull 관련 에러처리, 머지처리 등등 알아보고 변경해야됨 지금은 그냥 pull 만 받게해놓음
  const lastCommitAtProcess = spawnSync('git', ['-C', buildPath, 'log', '-1','--date=format:%Y/%m/%d %T', '--format=%ad']);
  foundProcess.lastCommitAt = lastCommitAtProcess.stdout.toString("utf8");
  foundProcess.build_path = buildPath;
  registeredProcess = registeredProcess.filter(it => it.id !== id);
  registeredProcess = registeredProcess.concat(foundProcess).sort((a,b)=> a.id-b.id);

  fs.writeFileSync(processesFileName, JSON.stringify(registeredProcess));
  res.json(registeredProcess)

});

module.exports = router;