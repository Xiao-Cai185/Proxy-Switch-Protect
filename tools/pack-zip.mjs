import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const zipOutDir = path.resolve(distDir, 'zip');
const packageJsonPath = path.resolve(rootDir, 'package.json');

/**
 * 将 JS Date 转换为 DOS Date / Time 格式
 */
function toDosDateTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dt =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dt };
}

/**
 * 递归收集目录下的所有文件（排除指定路径）
 */
function collectFiles(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // 严禁将 zip 输出目录自身及其内容打入包内
    if (fullPath === zipOutDir || fullPath.startsWith(zipOutDir + path.sep)) {
      continue;
    }
    // 忽略常见系统隐藏/临时文件
    if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db') {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      results.push({
        fullPath,
        relPath,
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  }
  return results;
}

/**
 * 使用纯 Node.js 标准库根据 PKZIP 2.0 规范构建标准 zip 压缩文件
 */
function createZipArchive(files, outputPath) {
  const localHeadersAndData = [];
  const centralDirectoryHeaders = [];
  let currentOffset = 0;

  for (const file of files) {
    const fileData = fs.readFileSync(file.fullPath);
    const fileNameBuf = Buffer.from(file.relPath, 'utf8');
    const crc = zlib.crc32(fileData);
    const compressedData = zlib.deflateRawSync(fileData, { level: 9 });
    const { time, date: dt } = toDosDateTime(file.mtime);

    // 1. Local File Header (30 字节)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // 签名
    localHeader.writeUInt16LE(20, 4); // 提取所需版本 2.0
    localHeader.writeUInt16LE(0x0800, 6); // 标志位：启用 UTF-8 文件名
    localHeader.writeUInt16LE(8, 8); // 压缩方法：DEFLATE
    localHeader.writeUInt16LE(time, 10); // 文件修改时间
    localHeader.writeUInt16LE(dt, 12); // 文件修改日期
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // 压缩后大小
    localHeader.writeUInt32LE(fileData.length, 22); // 原始未压缩大小
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // 文件名长度
    localHeader.writeUInt16LE(0, 28); // 额外字段长度

    localHeadersAndData.push(localHeader, fileNameBuf, compressedData);

    // 2. Central Directory File Header (46 字节)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // 签名
    centralHeader.writeUInt16LE(20, 4); // 制作版本 2.0
    centralHeader.writeUInt16LE(20, 6); // 提取所需版本 2.0
    centralHeader.writeUInt16LE(0x0800, 8); // 标志位：启用 UTF-8 文件名
    centralHeader.writeUInt16LE(8, 10); // 压缩方法：DEFLATE
    centralHeader.writeUInt16LE(time, 12); // 文件修改时间
    centralHeader.writeUInt16LE(dt, 14); // 文件修改日期
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // 压缩后大小
    centralHeader.writeUInt32LE(fileData.length, 24); // 原始未压缩大小
    centralHeader.writeUInt16LE(fileNameBuf.length, 28); // 文件名长度
    centralHeader.writeUInt16LE(0, 30); // 额外字段长度
    centralHeader.writeUInt16LE(0, 32); // 注释长度
    centralHeader.writeUInt16LE(0, 34); // 磁盘号起始
    centralHeader.writeUInt16LE(0, 36); // 内部文件属性
    centralHeader.writeUInt32LE(0x81a40000, 38); // 外部文件属性：标准普通文件权限
    centralHeader.writeUInt32LE(currentOffset, 42); // 本地文件头相对偏移量

    centralDirectoryHeaders.push(centralHeader, fileNameBuf);

    currentOffset += 30 + fileNameBuf.length + compressedData.length;
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectorySize = centralDirectoryHeaders.reduce((sum, b) => sum + b.length, 0);

  // 3. End of Central Directory Record (22 字节)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // 签名
  eocd.writeUInt16LE(0, 4); // 当前磁盘号
  eocd.writeUInt16LE(0, 6); // 核心目录开始磁盘号
  eocd.writeUInt16LE(files.length, 8); // 本磁盘记录数
  eocd.writeUInt16LE(files.length, 10); // 总记录数
  eocd.writeUInt32LE(centralDirectorySize, 12); // 核心目录大小
  eocd.writeUInt32LE(centralDirectoryOffset, 16); // 核心目录偏移量
  eocd.writeUInt16LE(0, 20); // 注释长度

  const fullArchiveBuffer = Buffer.concat([
    ...localHeadersAndData,
    ...centralDirectoryHeaders,
    eocd,
  ]);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fullArchiveBuffer);

  return fullArchiveBuffer.length;
}

function main() {
  if (!fs.existsSync(packageJsonPath)) {
    console.error('✗ 错误：未找到 package.json 文件！');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = pkg.version || '0.0.0';
  const zipFileName = `proxy-switch-protect-${version}.zip`;
  const zipFilePath = path.join(zipOutDir, zipFileName);

  if (!fs.existsSync(distDir)) {
    console.error('✗ 错误：未找到 dist 产物目录，请先执行构建！');
    process.exit(1);
  }

  console.log(`\n📦 正在打包 Chrome 扩展压缩包：proxy-switch-protect-${version}…`);
  const files = collectFiles(distDir);

  if (files.length === 0) {
    console.error('✗ 错误：dist 目录下没有可打包的文件！');
    process.exit(1);
  }

  const rawTotalSize = files.reduce((sum, f) => sum + f.size, 0);
  const zipSize = createZipArchive(files, zipFilePath);

  const rawKb = (rawTotalSize / 1024).toFixed(1);
  const zipKb = (zipSize / 1024).toFixed(1);
  const ratio = (((rawTotalSize - zipSize) / rawTotalSize) * 100).toFixed(1);

  console.log(`✓ 压缩打包成功！共打包 ${files.length} 个文件`);
  console.log(`  - 原始大小：${rawKb} KB`);
  console.log(`  - 压缩包体积：${zipKb} KB (体积缩减 ${ratio}%)`);
  console.log(`  - 导出目标：${path.relative(rootDir, zipFilePath)}\n`);
}

main();
