var shell = require("shelljs");
shell.config.silent = true;
var dayjs = require("dayjs");
var axios = require("axios");
var fs = require("fs");
var path = require("path");
var config = require("./config");
var repositoryDir = "/Users/wzl/repository";

(async () => {
    for (let item of config) {
        await processProject(
            item.projectName,
            item.gitUrl,
            item.groupName,
            item.dateBefore
        );
    }
})();

async function shellWeCloneAtFirst(projectName) {
    shell.cd(`${repositoryDir}`);
    return await new Promise(resolve => {
        shell.exec(`ls -l | grep "${projectName}"`, function(
            code,
            stdout,
            stderr
        ) {
            if (stdout.replace(" ", "") == "") {
                resolve(true);
            }
            resolve(false);
        });
    });
}

async function cloneProject(gitUrl) {
    await new Promise(resolve => {
        shell.exec(`git clone ${gitUrl}`, function(code, stdout, stderr) {
            resolve();
        });
    });
}

async function fetchAllBranch() {
    await new Promise(resolve => {
        shell.exec(`git fetch`, function(code, stdout, stderr) {
            resolve();
        });
    });
}

async function getProjectBranch() {
    await fetchAllBranch();
    let branches = await new Promise(resolve => {
        shell.exec(`git branch -a`, function(code, stdout, stderr) {
            let rawBranchs = stdout.split("\n").filter(i => i);
            let branches = new Set();
            for (let raw of rawBranchs) {
                raw = raw.replace(/[\s*]/g, "");
                if (raw.indexOf("(HEAD") != -1) continue;
                if (raw.indexOf("/") != -1) {
                    let items = raw.split("/");
                    branches.add(items[items.length - 1]);
                } else {
                    branches.add(raw);
                }
            }
            resolve(Array.from(branches));
        });
    });
    return branches;
}


async function getProjectBranchEngeers(branch) {
    shell.exec(`git checkout ${branch}`);
    shell.exec(`git pull`);
    let engineers = await new Promise(resolve => {
        shell.exec(
            `git log --format='%aN' | sort -u | grep -v unknown | uniq`,
            function(code, stdout, stderr) {
                resolve(stdout.split("\n").filter(item => item));
            }
        );
    });
    return engineers;
}

async function processOneBranchOneDay(branch, date, dealHashSet, engineers) {
    let oneBranchOneDateAllEngineersWorkStat = [];
    for (let engineer of engineers) {
        // console.log(`[data]:${date}  [branch];${branch}  ${engineer}`);
        let {oneDateOneBranchTotalAddLines, oneDateOneBranchTotalRemoveLines} = await calcEngineerOneBranchOneDateWork(engineer, date, dealHashSet, branch);
        // console.log(`[data]:${date}  [branch];${branch}  [engineer]:${engineer}  [add]:${oneDateOneBranchTotalAddLines}  [delete]:${oneDateOneBranchTotalRemoveLines}`);
        oneBranchOneDateAllEngineersWorkStat.push(
            {
                engineer: engineer,
                date: date,
                branch: branch,
                add: oneDateOneBranchTotalAddLines,
                delete: oneDateOneBranchTotalRemoveLines
            }
        )
    }
    return oneBranchOneDateAllEngineersWorkStat;
}

async function checkoutBranch(branch) {
    return await new Promise(resolve => {
        shell.exec(`git checkout ${branch}`, function(
            code,
            stdout,
            stderr
        ) {
            if (stdout.includes("did not match")) {
                console.log(`切换失败 ${branch}`);
                resolve(false);
                return ;
            } else {
                console.log(`成功切换到 ${branch}`);
                resolve(true);
                return ;
            }
        });
    });
}

async function getOneDateOneBranchOneEngineerAllCommitHashes(date, engineer) {
    return await new Promise(resolve => {
        shell.exec(
            `git log --after="${date} 00:00:00" --before="${date} 23:59:59"  --author=${engineer} --pretty=tformat:%h --no-merges`,
            function(code, stdout, stderr) {
                let hashes = stdout.split("\n").filter(item => item);
                resolve(hashes);
            }
        );
    });
}

function checkWhetherThisEngineerHasCalcThisHash(dealHashSet, hash) {
    if (dealHashSet.has(hash)) {
        return true;
    } else {
        dealHashSet.add(hash)
        return false;
    }
}

async function getHashModifyFileStats(hash) {
    return await new Promise(resolve => {
        shell.exec(`git show --stat-width=300 --compact-summary ${hash} | grep -E "vue\\>|java\\>|js\\>" | grep -v "static"`, function(code, stdout, stderr) {
            let fileStats = stdout.split("\n").filter(item => item).map(item => {
                let fileStat = item.split(" ").filter(item => item);
                let fileName = fileStat[0];
                let isNew = fileStat[1].includes("new")
                return {fileName, isNew}
            });
            resolve(fileStats);
        })
    })
}

async function processUpdateCase(hash, fileName) {
    return await new Promise(resolve => {
        shell.exec(`git diff ${hash}~ ${hash} -- ${fileName}`, function(code, stdout, stderr) {
            let rawModifyLines = stdout
                .split("\n")
                .filter(
                    item => item.startsWith("+") || item.startsWith("-")
                )
                .map(item => {
                    return item.toUpperCase().replace(/\s*/g, "");
                })
                .filter(
                    item =>
                        item.length > 5 &&
                        !(item.startsWith("---") || item.startsWith("+++"))
                );
            let clarifyModifyLines = [];
            let mask = false;
            for (let line of rawModifyLines) {
                if (
                    line.startsWith("+//") ||
                    line.startsWith("-//") ||
                    (line.includes("<!--") && line.includes("-->")) ||
                    (line.includes("/*") && line.includes("*/"))
                ) {
                    continue;
                }
                if (
                    (line.includes("/*") && !line.includes("*/")) ||
                    (line.includes("<!--") && !line.includes("-->"))
                ) {
                    mask = true;
                    continue;
                }
                if (!mask) {
                    clarifyModifyLines.push(line);
                } else {
                    if (line.includes("*/") || line.includes("-->")) {
                        mask = false;
                    }
                }
            }
            resolve(clarifyProcess(clarifyModifyLines));
        });
    })
}


async function calcEngineerOneBranchOneDateWork(engineer, date, dealHashSet, branch) {
    let oneDateOneBranchTotalAddLines = 0;
    let oneDateOneBranchTotalRemoveLines = 0;
    let hashes = await getOneDateOneBranchOneEngineerAllCommitHashes(date, engineer);
    let root = shell.pwd().toString();
    // console.log(`hash: ${hashes}`)
    for (let hash of hashes) {
        let hasCalcCosine = false;
        let initVectorMap, fileVectorMap;
        // console.log(`[engineer]:${engineer} [hash]:${hash}`)
        if (checkWhetherThisEngineerHasCalcThisHash(dealHashSet, hash)) {
            continue;
        }
        let fileStats = await getHashModifyFileStats(hash)
        for (let fileStat of fileStats) {
            let initCommit = false;
            // console.log(`[hash]:${hash}  [fileStat]:${JSON.stringify(fileStat)}`)
            if (!fileStat.isNew || initCommit) {
                let { addLines, removeLines } = await processUpdateCase(hash, fileStat.fileName);
                oneDateOneBranchTotalAddLines += addLines;
                oneDateOneBranchTotalRemoveLines += removeLines;
            } else {
                if (!hasCalcCosine) {
                    let success = await checkoutBranch(`${hash}~`)
                    if (success) {
                        hasCalcCosine = true;
                        let paths = []
                        findAllConcentrateFile(root, paths);
                        ({initVectorMap, fileVectorMap} = constructAllFileWordVector(paths));
                        await checkoutBranch(hash);
                    } else{
                        initCommit = true;
                        let { addLines, removeLines } = await processUpdateCase(hash, fileStat.fileName);
                        oneDateOneBranchTotalAddLines += addLines;
                        oneDateOneBranchTotalRemoveLines += removeLines;
                        continue;
                    }
                } 
                let absoluteNewFilePath = path.join(root, fileStat.fileName);
                let newAddFileWordVector = constructFileWordVector(absoluteNewFilePath, initVectorMap);
                let isSimilar = false;
                for (let key of fileVectorMap.keys()) {
                    let cosine = calcSimilarCosine(newAddFileWordVector, fileVectorMap.get(key))
                    if (cosine > 0.97) {
                        console.log(`[发现疑似复制文件] 相似程度:${cosine} file1[${hash}]:${absoluteNewFilePath} @ file2[${hash}~]:${key}`);
                        isSimilar = true;
                        break;
                    }
                }
                if (!isSimilar) {
                    let { addLines, removeLines } = await processUpdateCase(hash, fileStat.fileName);
                    oneDateOneBranchTotalAddLines += addLines;
                    oneDateOneBranchTotalRemoveLines += removeLines;
                }
            }
        }
        if (hasCalcCosine) {
            await checkoutBranch(branch);
        }
    }
    return {oneDateOneBranchTotalAddLines, oneDateOneBranchTotalRemoveLines}
}

async function processOneDay(branches, date) {
    let allBranchOneDateAllEngineersWorkStat = [];
    let dealHashSet = new Set();
    for (let branch of branches) {
        await checkoutBranch(branch);
        let engineers = await getProjectBranchEngeers(branch);
        // console.log(`[branch]:${branch} 攻城狮(共:${engineers.length}位): ${JSON.stringify(engineers)}`);
        let oneBranchOneDateAllEngineersWorkStat = await processOneBranchOneDay(branch, date, dealHashSet, engineers);
        allBranchOneDateAllEngineersWorkStat = allBranchOneDateAllEngineersWorkStat.concat(oneBranchOneDateAllEngineersWorkStat)
    }
    return allBranchOneDateAllEngineersWorkStat;
}

async function processProject(projectName, gitUrl, groupName, before) {
    shell.cd(`${repositoryDir}`);
    let needInit = await shellWeCloneAtFirst(projectName);
    console.log(`need init ${needInit}`);
    if (needInit) {
        await cloneProject(gitUrl)
    }
    shell.cd(`${projectName}`);
    let branches = await getProjectBranch();
    for (let sub = 1; sub <= before; sub++) {
        let date = dayjs().add(sub * -1, "day").format("YYYY-MM-DD");
        let allBranchOneDateAllEngineersWorkStat = await processOneDay(branches, date);
        allBranchOneDateAllEngineersWorkStat = allBranchOneDateAllEngineersWorkStat.filter(item => item.add > 0 || item.delete> 0)
        console.log(allBranchOneDateAllEngineersWorkStat)
        let finalStatResult = aggregateOneDateWorkByEngineerName(allBranchOneDateAllEngineersWorkStat);
        console.log(`${projectName} ${date} ${JSON.stringify(finalStatResult)}`)
        await uploadData(date, projectName, groupName, finalStatResult);
    }
}

function aggregateOneDateWorkByEngineerName(allEngineerOneDateAllBranchStatArr) {
    let map = new Map();
    for (let oneEngineerOneDateOneBranchStat of allEngineerOneDateAllBranchStatArr) {
        if (map.has(oneEngineerOneDateOneBranchStat.engineer)) {
            let item = map.get(oneEngineerOneDateOneBranchStat.engineer);
            item.branches.push(oneEngineerOneDateOneBranchStat.branch);
            item.add += oneEngineerOneDateOneBranchStat.add;
            item.delete += oneEngineerOneDateOneBranchStat.delete;
            map.set(oneEngineerOneDateOneBranchStat.engineer, item);
        } else {
            map.set(oneEngineerOneDateOneBranchStat.engineer, {
                engineer: oneEngineerOneDateOneBranchStat.engineer,
                branches: [oneEngineerOneDateOneBranchStat.branch],
                date: oneEngineerOneDateOneBranchStat.date,
                add: oneEngineerOneDateOneBranchStat.add,
                delete: oneEngineerOneDateOneBranchStat.delete
            })
        }
    }
    return Array.from(map.values());
}

async function uploadData(date, projectName, groupName, params) {
    url = "backend_url"; //todo 需要替换成后台连接
    let body = await axios.post(
        url, 
        {
            projectName: projectName,
            groupName: groupName,
            date: date,
            statList: params
        }
    );

}





function clarifyProcess(modifyLines) {
    let addLines = 0;
    let removeLines = 0;
    let tempRemoveLine = "";
    let checkFomat = false;
    let currentRemove = 0;
    modifyLines.forEach(line => {
        if (line.startsWith("-")) {
            checkFomat = true;
            if (checkFomat) {
                tempRemoveLine += line;
            }
            currentRemove++;
        } else {
            line = line.replace(/^\+/, "");
            if (checkFomat) {
                if (!tempRemoveLine.includes(line)) {
                    addLines++;
                    checkFomat = false;
                    tempRemoveLine = "";
                } else {
                    currentRemove =
                        currentRemove - 1 > 0 ? currentRemove - 1 : 0;
                    currentRemove--;
                }
            } else {
                addLines++;
            }
        }
    });
    removeLines +=currentRemove
    return { addLines, removeLines };
}

function findAllConcentrateFile(currentPath, filePathCollector) {
    fs.readdirSync(currentPath).forEach(filename => {
        let state = fs.lstatSync(path.join(currentPath, filename));
        if (state.isDirectory()) {
            if (filename.includes("node_modules") || filename.includes("target") || filename.includes("static") || filename.includes("docker") || filename.includes("dist")) return;
            findAllConcentrateFile(path.join(currentPath, filename), filePathCollector);
        } else {
            if (filename.endsWith(".java") || filename.endsWith(".vue") || filename.endsWith(".js")) {
                let exist = fs.existsSync(path.join(currentPath, filename));
                if (exist) {
                    filePathCollector.push(path.join(currentPath, filename));
                }
            };
        }
    })
}

function constructFileWordVector(filePath, initVectorMap) {
    let singleFileMap = new Map(initVectorMap);
    let exist = fs.existsSync(filePath);
    if (!exist) {
        return singleFileMap;
    }
    let fileContent = fs.readFileSync(filePath).toString().replace(/\s+/g, " ");
    let singleFileWords = fileContent.split(" ").filter(item => item.length > 3)
    for (let word of singleFileWords) {
        if (initVectorMap.has(word)) {
            singleFileMap.set(word, singleFileMap.get(word) + 1)
        }
    }
    return Array.from(singleFileMap.values());
}

function constructAllFileWordVector(filePaths) {
    let totalContent = "";
    let initVectorMap = new Map();
    let fileVectorMap = new Map();
    for (let filePath of filePaths) {
        let fileContent = fs.readFileSync(filePath).toString().replace(/\s+/g, " ");
        totalContent += fileContent
    }
    let totalWords = totalContent.split(" ").filter(item => item.length > 3);
    for(let word of totalWords) {
        initVectorMap.set(word, 0)
    }
    for (let filePath of filePaths) {
        fileVectorMap.set(filePath, constructFileWordVector(filePath, initVectorMap));
    }
    return {initVectorMap, fileVectorMap}
}

function dot(vector1, vector2) {
    let result = 0;
    for (let idx=0; idx<vector1.length; idx++) {
        result += vector1[idx] * vector2[idx]
    }
    return result;
}

function multiplyNorm(vector1, vector2) {
    let result = Math.pow(vector1.reduce((ac, cu) => {return ac + Math.pow(cu, 2)}, 0), 0.5)  * Math.pow(vector2.reduce((ac, cu) => {return ac + Math.pow(cu, 2)}, 0), 0.5)
    if (result < 0.0000001) {
        return 1;
    }
    return result;
}

function calcSimilarCosine(vector1, vector2) {
    return dot(vector1, vector2) / multiplyNorm(vector1, vector2);
}


