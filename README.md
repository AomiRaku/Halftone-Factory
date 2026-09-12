<div align="center">

<img width="160" alt="HF-Logo" src="https://github.com/user-attachments/assets/9014a970-5bf0-4af3-b116-95fd1936bc14" />

# 半调工厂 Halftone Factory
### 半调网点图像生成器

该项目为纯 HTML + CSS + JavaScript

Made with ❤️ by [羽梦千景 Raku Inkyetta](https://github.com/AomiRaku)

</div>

## 快速开始

#### ⭐方法 1 ：直接访问 [此处](https://aomiraku.github.io/Halftone-Factory/) 开始。这是该项目的 Github Pages。所有数据都在本地处理。

#### ⭐方法 2 ：下载源码到本地并解压，直接用浏览器打开 `index.html` 。

####  方法 3 ：下载源码到本地解压，在项目根目录本地启动静态服务器：

```bash
python3 -m http.server 6702
```
```
然后访问：http://127.0.0.1:6702
```

## 功能

一个半调网点图像生成工具，可以将素材转换成可调参数的半调 网点/点阵/符号栅格 效果。
面向平面设计、前端实验、视觉方向探索、符号点阵图原型制作等场景。
- 支持导入各种格式的图像
- 圆点、叉号、方块、斜线、加号、三角形 六种形状
- 纯色、灰度、原彩、渐变映射 四种色彩模式
- 可导出 PNG 位图、SVG 矢量图
- 优化的实时预览，上万点仍保持流畅。

<img height="400" alt="HF-Main" src="https://github.com/user-attachments/assets/d96f7c22-221f-472c-8dab-ac57a375984c" />
<img height="400" alt="HF-Sett" src="https://github.com/user-attachments/assets/961c7d24-b249-475d-a7ae-b8848955e4f5" />

## 浏览器支持

- Chrome 80+
- Edge 80+
- Chromium 80+
- Firefox 113+
- Safari 17+

## 实验性功能

- 导入动态视频、GIF**（计划移除）**
- 多素材转场：消隐 (dissolve) 和 点云重组 (point-path)**（计划移除）**
- WebM 和 GIF 动态导出**（计划移除，后期将随其他功能回归）**

## 其他

- 该项目所有数据均在本地处理，没有任何数据上传。根本就没有服务器（）
- 素材如果使用 透明背景图像，或白底、高对比主体图，效果会更佳。
- 创建该项目的起因是，做图的时候发现网上的这类工具全都要付费导出或是限制使用，一气之下干脆自己弄一个。😋
- 本项目的基础功能，源自 [halftone-lab](https://github.com/vibe-lark/halftone-lab) 的代码并进行了重构和优化改进。
- 本项目采用 [MIT协议](LICENSE) 。
