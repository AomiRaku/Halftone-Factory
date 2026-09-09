# 半调工厂 (Halftone Factory)

一个半调图像处理工具，可以将素材转换成可调参数的半调网点 / 点阵 / 符号栅格效果。
面向平面设计、前端实验、视觉方向探索、符号点阵图原型制作等场景。

该项目的起因是做图的时候，发现网上的这类工具全都要付费，一气之下干脆自己弄一个。
项目为纯 HTML + CSS + JavaScript。

Made with ❤️ by [羽梦千景 Raku Inkyetta](https://github.com/AomiRaku)

## 功能：

- 支持导入各种格式的图像
- 圆点、叉号、方块、斜线、加号、三角形 六种形状
- 纯色、灰度、原彩、渐变映射 四种色彩模式
- 可导出 PNG 位图、SVG 矢量图

## 实验性功能：
- 导入动态视频、GIF
- 多素材转场：消隐 (dissolve) 和 点云重组 (point-path)
- WebM 和 GIF动态导出

## 开始使用

#### 方法 1 ：直接访问 [此处](https://aomiraku.github.io/Halftone-Factory/) 开始。这是该项目的 Github Pages。所有数据都在本地处理。

#### 方法 2 ：下载源码到本地解压，直接用浏览器打开 `index.html` 。

#### 方法 3 ：下载源码到本地解压，在项目根目录本地启动静态服务器：

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

- 图像：透明 PNG/WebP 或白底/高对比产品/物体抠图。（只是建议，事实上基本什么图片都行）
- 大文件：上传前可以先压缩分辨率，或许在中低配置机器上会更流畅。


## 其他
- 本项目的基础功能来自项目 https://github.com/vibe-lark/halftone-lab 的代码进行重构和改进。
- 本项目采用 [MIT协议](LICENSE) 。
