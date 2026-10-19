/**
 * Resolved view tree -> a JSON description of HubSpot UI-extension components (`@hubspot/ui-extensions` names). Data,
 * not React: a thin card deployed once maps `{ type, props, children }` onto `React.createElement(components[type], ...)`
 * and routes `props.action` to the actions endpoint, so a changed card is a publish, not a card deploy.
 *
 * A node is `{ type, props?, children? }`; a child is a string (text) or a node. Strings are text, never markup.
 */
const { str, safeUrl, toneOf } = require('./common');

/** The component names this emits, so the card can fail closed on one it does not know. */
const HUBSPOT_COMPONENTS = ['Flex', 'Heading', 'Text', 'List', 'Tag', 'Button', 'EmptyState', 'DescriptionList', 'DescriptionListItem', 'Divider', 'Table', 'TableHead', 'TableBody', 'TableRow', 'TableHeader', 'TableCell'];
const TAG_VARIANT = { positive: 'success', warning: 'warning', critical: 'error', neutral: 'default' };

const node = (type, props, children) => ({ type, ...(props && Object.keys(props).length ? { props } : {}), ...(children && children.length ? { children } : {}) });

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
            case 'Empty': return node('EmptyState', { title: str(p.text), layout: 'vertical' });
            case 'Divider': return node('Divider', { distance: 'sm' });
            case 'Button': {
                const a = p.action;
                const variant = p.style === 'primary' ? 'primary' : p.style === 'danger' ? 'destructive' : 'secondary';
                let action;
                if (a?.type === 'userAction' && typeof a.workflow === 'string') action = { type: 'userAction', workflow: a.workflow, surface, ...(integrationId ? { integrationId: String(integrationId) } : {}), ...(a.input ? { input: a.input } : {}) };
                else if (a?.type === 'open_url' && safeUrl(a.url)) action = { type: 'open_url', url: safeUrl(a.url) };
                // A button with no usable action still renders (disabled), so the card matches the definition.
                return node('Button', { variant, ...(action ? { action } : { disabled: true }) }, [str(p.label) || 'Open']);
            }
            default: return kids().length === 1 ? kids()[0] : node('Flex', { direction: 'column', gap: 'sm' }, kids());
        }
    };
    return go(view);
}

module.exports = { viewToHubSpot, HUBSPOT_COMPONENTS };
