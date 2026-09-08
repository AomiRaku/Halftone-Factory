# 半调工厂 (Halftone Factory)

一个半调图像处理工具，可以将素材转换成可调参数的半调网点 / 点阵 / 符号栅格效果。
面向平面设计、前端实验、视觉方向探索、符号点阵图原型制作等场景。

做项目的时候，发现网上的这类工具全都要付费，于是干脆自己弄一个。
项目为纯 HTML + CSS + JavaScript。

Made with ❤️ by [羽梦千景 Raku Inkyetta](https://github.com/AomiRaku)

## 功能：

- 支持上传图片、GIF、MP4、WebM、MOV
- 圆点、叉号、方块、粗斜线、加号 五种符号形状
- 纯色、灰度、原彩、渐变映射 四种色彩模式
- 可导出PNG 位图、SVG 矢量图

## 动态相关功能为*实验性功能*：
- 导入动态视频
- 多素材转场：消隐 (dissolve) 和 点云重组 (point-path)
- WebM 和 GIF动态导出

## 开始使用

#### 方法1：直接访问仓库介绍处的链接使用。那是 Github Pages。

#### 方法2：下载源码到本地解压，直接用浏览器打开 `index.html` 。

#### 方法3：在本地启动静态服务器：

```bash
python3 -m http.server 6702
```
然后访问：
```text
http://127.0.0.1:6702
```

## 浏览器支持

- Chrome
- Edge
- Safari 17+

## 素材建议

为了获得最佳效果：

- 图片：透明 PNG/WebP 或高对比产品/物体抠图。
- 大文件：上传前可以先压缩分辨率，浏览器会更流畅。


- GIF / 视频：2-10 秒，尽量可循环
- 视频格式：推荐 MP4 或 WebM
- 透明视频：带 alpha 的 WebM 效果最好

## 其他
- 本项目基本功能改进自项目 https://github.com/vibe-lark/halftone-lab
- 本项目采用MIT协议. 详见 [LICENSE](LICENSE)。
