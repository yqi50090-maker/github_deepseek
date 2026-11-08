window.__ModuleLoader__.load({
  id: '@local/qq',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/api/qq-attach'

    // 跟随宿主主题：只用 currentColor 与透明度，不写死颜色
    const styles = {
      wrap: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12 },
      btn: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid currentColor', background: 'transparent',
        color: 'inherit', fontSize: 12, lineHeight: 1.6, opacity: 0.85,
      },
      btnBusy: { opacity: 0.45, cursor: 'default' },
      hint: { opacity: 0.65 },
      ok: { opacity: 0.85 },
      bad: { opacity: 0.95, color: '#d9534f' },
    }

    function Dot({ color }) {
      return h('span', {
        style: { width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flex: '0 0 auto' },
      })
    }

    function QqAttach() {
      const [state, setState] = React.useState({ kind: 'idle' })
      const alive = React.useRef(true)
      React.useEffect(() => () => { alive.current = false }, [])

      const connect = async () => {
        setState({ kind: 'busy', text: '正在连接…' })
        try {
          const r = await fetch(API, { method: 'POST', headers: { accept: 'application/json' } })
          const j = await r.json().catch(() => ({}))
          if (!alive.current) return
          if (j.status === 'online') { setState({ kind: 'online', id: j.id, nickname: j.nickname }); return }
          if (j.status === 'need-login') {
            setState({
              kind: 'need-login',
              path: j.qr && j.qr.path ? j.qr.path : '',
            })
            return
          }
          setState({ kind: 'failed', text: j.why || '未知原因' })
        } catch (e) {
          if (alive.current) setState({ kind: 'failed', text: String(e && e.message ? e.message : e) })
        }
      }

      const refresh = async () => {
        try {
          const r = await fetch(API, { headers: { accept: 'application/json' } })
          const j = await r.json().catch(() => ({}))
          if (!alive.current) return
          if (j.status === 'online') setState({ kind: 'online', id: j.id, nickname: j.nickname })
        } catch { /* 静默：这里只是顺带刷新 */ }
      }

      React.useEffect(() => { refresh() }, [])

      const busy = state.kind === 'busy'
      const dotColor = state.kind === 'online' ? '#4caf50' : state.kind === 'failed' ? '#d9534f' : 'currentColor'
      // 工具行右侧空间窄：只留绿点 + QQ 两个字，详情全部塞进 title
      const tip =
        state.kind === 'online' ? `QQ 已接入：${state.id} ${state.nickname || ''}`.trim()
        : state.kind === 'need-login' ? `需要扫码，二维码已弹出${state.path ? '：' + state.path : ''}`
        : state.kind === 'failed' ? `连不上：${state.text}`
        : '检查 QQ 通道；没通就拉起 NapCat，需要扫码时把二维码递到桌面'

      return h('div', { style: styles.wrap },
        h('button', {
          type: 'button',
          onClick: connect,
          disabled: busy,
          title: tip,
          'aria-label': tip,
          style: { ...styles.btn, ...(busy ? styles.btnBusy : null) },
        },
          h(Dot, { color: dotColor }),
          busy ? '…' : 'QQ'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 2026-11-01 主人要求：放到对话框上方、计费右边 ——
        //   改挂 conversation.input.right（输入框工具行右侧、发送按钮之前），
        //   那是「compact controls」区，天然与计费/模型选择器同一行。
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'qq-attach',
          order: 0,
        }, QqAttach))
      },
    }
  },
})
