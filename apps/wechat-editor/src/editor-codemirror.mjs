import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

export function mountCodeMirror({ parent, value = "", onChange, onScroll, onPaste } = {}) {
  if (!parent) throw new Error("CodeMirror mount 需要 parent");
  const extensions = [
    basicSetup,
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    EditorView.domEventHandlers({
      paste(event, view) {
        const text = event.clipboardData?.getData("text/plain") || "";
        if (!text || !onPaste) return false;
        return Boolean(onPaste({ event, view, text }));
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange?.(update.state.doc.toString(), update);
    }),
  ];
  const state = EditorState.create({ doc: String(value), extensions });
  const view = new EditorView({ state, parent });
  if (onScroll) view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
  return {
    hasCodeMirror: true,
    view,
    scrollElement: view.scrollDOM,
    getValue: () => view.state.doc.toString(),
    setValue(next) {
      const valueText = String(next ?? "");
      if (valueText === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: valueText } });
    },
    getSelection: () => ({ start: view.state.selection.main.from, end: view.state.selection.main.to }),
    replaceSelection(text) {
      const selection = view.state.selection.main;
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: String(text ?? "") }, selection: { anchor: selection.from + String(text ?? "").length } });
      view.focus();
    },
    focus() { view.focus(); },
    destroy() { view.destroy(); },
  };
}
