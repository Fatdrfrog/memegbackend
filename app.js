const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const axios = require("axios");
const Jimp = require("jimp");
const { Configuration, OpenAIApi } = require("openai");
const { v4 } = require("uuid");
const cors = require("cors");
const sharp = require("sharp");

const app = express();

dotenv.config();

app.use(express.static("public"));

app.use(express.json(), cors());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function getBase64(url, id) {
  await axios
    .get(url, {
      responseType: "buffer",
    })
    .then((response) =>
      fs.writeFile(
        `./assets/src_${id}.png`,
        Buffer.from(response.data, "binary").toString("base64"),
        "base64",
        function (err, data) {
          if (err) console.log("writing file error");
        }
      )
    );

  await sharp(`./assets/src_${id}.png`)
    .resize({ height: 512, width: 512 })
    .toFile(`./assets/src_s_${id}.png`);
}

async function makePNGAlpha(req, res, next) {
  const source = req.body.imgSrc;
  const id = v4();
  await getBase64(source, id);
  await Jimp.read(`./assets/src_s_${id}.png`, async (err, image) => {
    if (err) throw err;

    const width = image.bitmap.width;
    const height = image.bitmap.height;

    const centerX = width / 2;
    const centerY = height / 2;
    const ellipseWidth = width / 2;
    const ellipseHeight = height / 4;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distanceX = x - centerX;
        const distanceY = y - centerY;
        const distance = Math.sqrt(
          Math.pow(distanceX, 2) / Math.pow(ellipseWidth, 2) +
            Math.pow(distanceY, 2) / Math.pow(ellipseHeight, 2)
        );
        if (distance <= 1) {
          const color = image.getPixelColor(x, y);
          const newColor = Jimp.rgbaToInt(
            Jimp.intToRGBA(color).r,
            Jimp.intToRGBA(color).g,
            Jimp.intToRGBA(color).b,
            0 // set alpha to zero
          );
          image.setPixelColor(newColor, x, y);
        }
      }
    }

    await image.writeAsync(`./assets/alpha_${id}.png`);

    req.src_id = id;
    next();
  });
}

app.post("/", makePNGAlpha, async (req, res) => {
  const id = req.src_id;

  console.log(id);

  try {
    const response = await openai.createImageEdit(
      fs.createReadStream(`./assets/src_s_${id}.png`),
      fs.createReadStream(`./assets/alpha_${id}.png`),
      "make the superhero mask on the face",
      1,
      "512x512"
    );
    console.log("response.data.data");
    console.log(response.data.data);
    res.send(response.data.data[0].url);

    // await getBase64(response.data.data[0].url);
    // fs.readFile("./assets/image.png", (err, data) => {
    //   if (err) {
    //     console.log("read file error");
    //     console.log(err);
    //   }
    //   res.send(data);
    // });
  } catch (error) {
    if (error.response) {
      const { status, data } = error.response;
      res.status(status).send(data);
    } else {
      res.status(500).send(error);
    }
  }
});

app.listen(8000, () => {
  console.log("server is listening on port 8000");
});
