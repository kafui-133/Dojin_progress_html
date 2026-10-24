# 音声のクレジット

`voice-pack/audio/` の読み上げ音声（21 種類の声 × 63 セリフ）は、音声合成モデル Fish Audio Drama 3（drama3-small）で作りました。

**Voice: Fish Audio Drama 3 (drama3-small) / Built with Fish Audio**

- 声はすべて、参照音声を使わずに作った架空の声です（実在の人物・声優の声をまねていません）
- 生成のあと、前後の無音を削り、音量（-16 LUFS）をそろえ、OGG（Opus 48kbps）に圧縮しています
- モデル: [fishaudio/drama-3](https://huggingface.co/fishaudio/drama-3)（Fish Audio Community License v1.0）
  - 実行には [audio.cpp](https://github.com/JarodMica/audio.cpp)（`drama-3-native` ブランチ）と、軽量版の量子化モデル [pentacoxian-dev/drama3-small-GGUF](https://huggingface.co/pentacoxian-dev/drama3-small-GGUF)（`drama3-small-IQ3_XXS.gguf`）を使いました

## この音声を使う・配るとき

- 「Built with Fish Audio」の表記を、使う場所（アプリ・Web ページ・説明書など）に載せてください
- Fish Audio Community License v1.0 の禁止事項（実在の人物になりすます、子どもの声で性的な内容を作る、音声合成モデルの学習に使う など）は、この音声にもかかります
- くわしくは [ライセンスの本文](https://huggingface.co/fishaudio/drama-3/blob/main/LICENSE) を読んでください
