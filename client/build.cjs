// ディレクトリ操作用
const fse = require('fs-extra')

try {
    // フォルダを削除
    fse.removeSync('../docs');
} catch (error) {
    console.log(error);
}

// ディレクトリをコピー
fse.copySync('./dist', '../docs');