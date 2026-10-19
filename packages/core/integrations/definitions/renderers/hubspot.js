/**
 * Resolved view tree -> a JSON description of HubSpot UI-extension components. Names and prop values were checked
 * against @hubspot/ui-extensions 0.17.1 (its shared.synced/types/components/*.d.ts). Data, not React: a thin card
 * deployed once maps `{ type, props, children }` onto `React.createElement(components[type], props, ...children)`, so a
 * changed card is a publish, not a card deploy.
 *
 * A node is `{ type, props?, children?, action? }`; a child is a string (text) or a node. Strings are text, never markup.
 * `props` holds only real component props, passed straight through. `action` is OURS, not a HubSpot prop: the card must
 * not spread it onto the component, but turn it into `onClick={() => runServerless(...)}` that posts it to the actions
 * endpoint (a userAction button), because a UI extension cannot call out except through a serverless function.
 * An `open_url` button needs no action: it is the real `href` prop, which the host opens in a new tab.
 */
const { str, safeUrl, toneOf } = require('./common');

/** The component names this emits, so the card can fail closed on one it does not know. */
const HUBSPOT_COMPONENTS = ['Flex', 'Heading', 'Text', 'List', 'Tag', 'Button', 'EmptyState', 'DescriptionList', 'DescriptionListItem', 'Divider', 'Table', 'TableHead', 'TableBody', 'TableRow', 'TableHeader', 'TableCell'];
const TAG_VARIANT = { positive: 'success', warning: 'warning', critical: 'error', neutral: 'default' };

const node = (type, props, children, action) => ({ type, ...(props && Object.keys(props).length ? { props } : {}), ...(action ? { action } : {}), ...(children && children.length ? { children } : {}) });

/**
 * @param {object|null} view
 * @param {{ integrationId?: string, surface?: string }} [opts]  carried on a button's `action`, so the card can post it back
 * @returns {object|null}
 */
function viewToHubSpot(view, { integrationId, surface } = {}) {
    const go = (v) => {
        if (!v || typeof v !== 'object') return null;
        const p = v.props || {};
        const kids = () => (v.children || []).map(go).filter(Boolean);
        switch (v.component) {
            case 'Stack': return node('Flex', { direction: 'column', gap: 'sm' }, kids());
            case 'Heading': return node('Heading', {}, [str(p.text)]);
            case 'Text': return node('Text', {}, [str(p.text)]);
            case 'KeyValue': return node('DescriptionList', { direction: 'row' }, (Array.isArray(p.items) ? p.items : []).map((it) => node('DescriptionListItem', { label: str(it?.label) }, [node('Text', {}, [str(it?.value) || '—'])])));
            case 'List': return node('List', { variant: 'unordered' }, (Array.isArray(p.items) ? p.items : []).map((it) => node('Flex', { direction: 'column', gap: 'flush' }, [node('Text', { format: { fontWeight: 'demibold' } }, [str(it?.title)]), ...(it?.meta ? [node('Text', { variant: 'microcopy' }, [str(it.meta)])] : [])])));
            case 'Table': return node('Table', {}, [
                node('TableHead', {}, [node('TableRow', {}, (Array.isArray(p.columns) ? p.columns : []).map((c) => node('TableHeader', {}, [str(c)])))]),
                node('TableBody', {}, (Array.isArray(p.rows) ? p.rows : []).map((r) => node('TableRow', {}, (Array.isArray(r) ? r : []).map((c) => node('TableCell', {}, [str(c)]))))),
            ]);
            case 'Badge': return node('Tag', { variant: TAG_VARIANT[toneOf(p.tone)] }, [str(p.text)]);
            case 'Empty': return node('EmptyState', { layout: 'vertical' }, [node('Text', {}, [str(p.text)])]);
            case 'Divider': return node('Divider', { distance: 'sm' });
            case 'Button': {
                const a = p.action;
                const variant = p.style === 'primary' ? 'primary' : p.style === 'danger' ? 'destructive' : 'secondary';
                let action;
                if (a?.type === 'userAction' && typeof a.workflow === 'string') action = { type: 'userAction', workflow: a.workflow, surface, ...(integrationId ? { integrationId: String(integrationId) } : {}), ...(a.input ? { input: a.input } : {}) };
                const href = a?.type === 'open_url' ? safeUrl(a.url) : null;
                // A button with no usable action still renders (disabled), so the card matches the definition.
                return node('Button', { variant, ...(href ? { href } : action ? {} : { disabled: true }) }, [str(p.label) || 'Open'], action);
            }
            default: return kids().length === 1 ? kids()[0] : node('Flex', { direction: 'column', gap: 'sm' }, kids());
        }
    };
    return go(view);
}

module.exports = { viewToHubSpot, HUBSPOT_COMPONENTS };
