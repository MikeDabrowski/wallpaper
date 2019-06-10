#! /usr/bin/node

const util = require("util");
const fs = require("fs");
const http = require("http");
const https = require("https");
const wallpaper = require("wallpaper");
const Stream = require("stream").Transform;

const dirPath = '/home/mike/Pictures'; //UPDATE PATH
const imgPrefix = 'POD';

httpRequest("https://www.pinkbike.com/photo/podlist/", {
  method: "GET",
  mode: "page"
})
  .then(findPods)
  .then(getImg)
  .then(changeWallpaper)
  .then(logExecution)
  .catch(console.error);

function findPods(siteHTML) {
  let foundStr = siteHTML.match(
    /src="https:\/\/ep1\.pinkbike\.org\/(.*?)\.jpg/
  )[0];
  if (foundStr) {
    foundStr = foundStr.replace(/p2/g, "p0");
  }
  if (foundStr.startsWith("src")) {
    return foundStr.substr(5);
  }
  return foundStr;
}

async function logLine(line) {
  await util.promisify(fs.appendFile)(`${dirPath}/wall.log`, `${getCurrentDate().time}: ${line}\n`);
}

async function logExecution({ fileName, date, time }) {
  const log = `${fileName} ${date} ${time}\n`;
  await logLine(log);
}

async function getImg(url) {
  const file = url.match(/\/p(.*?)\/p(.*?)$/)[2];
  const { date, time } = getCurrentDate();
  const name = `${dirPath}/${imgPrefix}_${date}_${file}`;
  await httpRequest(url, { method: "GET", mode: "image" }).then(c =>
    util.promisify(fs.writeFile)(name, c.read())
  );
  return {
    fileName: name,
    date,
    time
  };
}

function getCurrentDate() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return {
    date: `${year}-${month}-${day}`,
    time: `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`
  };
}

async function changeWallpaper({ fileName, date, time }) {
  await wallpaper.set(fileName)
    .then(r => logLine(`set wall ${fileName} ${r}`))
    .catch(er => logLine('err '+ er));

  let current = await wallpaper.get();
  if (current !== fileName) {
    console.error(
      `Error setting wallpaper, expected ${fileName}, got ${current}`
    );
  }
  return {
    fileName,
    date,
    time
  };
}

function httpRequest(url, params, postData) {
  return new Promise(function(resolve, reject) {
    let client = http;
    if (url.toString().indexOf("https") === 0) {
      client = https;
    }
    const req = client.request(url, params, function(res) {
      // reject on bad status
      if (res.statusCode === 302) {
        return resolve(res.headers);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(res);
        return reject(new Error("statusCode=" + res.statusCode));
      }
      // cumulate data
      var body =
        params.mode === "image"
          ? new Stream()
          : params.mode === "page"
          ? ""
          : [];
      res.on("data", function(chunk) {
        if (params.mode === "page") {
          body += chunk;
        } else {
          body.push(chunk);
        }
      });
      // resolve on end
      res.on("end", function() {
        if (params.mode !== "image" && params.mode !== "page") {
          try {
            body = JSON.parse(Buffer.concat(body).toString());
          } catch (e) {
            reject(e);
          }
        }
        resolve(body);
      });
    });
    req.on("uncaughtException", function globalErrorCatch(error, p) {
      console.error(error);
      console.error(error.stack);
    });
    // reject on request error
    req.on("error", function(err) {
      // This is not a "Second reject", just a different sort of failure
      console.log(err.stack);
      reject(err);
    });
    if (postData) {
      req.write(postData);
    }
    // IMPORTANT
    req.end();
  });
}
