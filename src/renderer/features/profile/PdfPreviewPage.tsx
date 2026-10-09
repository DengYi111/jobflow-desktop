import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Spin, Typography } from 'antd'
import { useParams } from 'react-router-dom'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const { Title, Text } = Typography
type PdfFile = { name: string; base64: string }

export function PdfPreviewPage() {
  const { resumeId = '' } = useParams()
  const [file, setFile] = useState<PdfFile>()
  const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const pagesElement = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof pdfjs.getDocument> | undefined
    async function loadPdf() {
      try {
        const result = await window.jobflow.resumes.readPdf({ id: resumeId })
        if (!result.ok) throw new Error(result.messageZh)
        if (cancelled) return
        setFile(result.data)
        const binary = atob(result.data.base64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        task = pdfjs.getDocument({
          data: bytes,
          cMapUrl: new URL('pdfjs/cmaps/', window.location.href).toString(),
          cMapPacked: true,
          standardFontDataUrl: new URL('pdfjs/standard_fonts/', window.location.href).toString(),
          wasmUrl: new URL('pdfjs/wasm/', window.location.href).toString(),
        })
        setPdfDocument(await task.promise)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF 预览失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadPdf()
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [resumeId])

  useEffect(() => {
    if (!pdfDocument || !pagesElement.current) return
    const document = pdfDocument
    let cancelled = false
    const container = pagesElement.current
    container.replaceChildren()
    async function renderPages() {
      try {
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (cancelled) return
          const page = await document.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.35 })
          const canvas = window.document.createElement('canvas')
          canvas.className = 'pdf-preview-canvas'
          canvas.dataset.page = String(pageNumber)
          container.append(canvas)
          const context = canvas.getContext('2d')
          if (!context) throw new Error('当前窗口无法绘制 PDF 页面')
          const ratio = window.devicePixelRatio || 1
          canvas.width = Math.ceil(viewport.width * ratio)
          canvas.height = Math.ceil(viewport.height * ratio)
          canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          }).promise
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF 页面渲染失败')
      }
    }
    void renderPages()
    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [pdfDocument])

  return (
    <main className="pdf-preview-page">
      <header className="pdf-preview-header">
        <div>
          <Title level={4}>{file?.name ?? '简历预览'}</Title>
          <Text type="secondary">本地 PDF 文件</Text>
        </div>
        <Button onClick={() => window.close()}>关闭预览</Button>
      </header>
      {loading && (
        <div className="pdf-preview-loading">
          <Spin />
          <Text>正在加载 PDF…</Text>
        </div>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message="无法显示此 PDF"
          description={<>{error}。可返回简历列表，检查文件或重新导入。</>}
        />
      )}
      {file && !error && <div ref={pagesElement} className="pdf-preview-pages" />}
    </main>
  )
}
