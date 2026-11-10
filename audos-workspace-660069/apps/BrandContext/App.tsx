import GlobalStyles from '../../components/ui/GlobalStyles';
import BrandDocPanel from '../../components/brand/BrandDocPanel';

/**
 * Brand Kit is no longer a dock app: the brand lives in the Brand doc on the
 * Verge home. This entry stays because Verger's studio bridge (and any saved
 * `brand-context` link) still mounts it by id; it renders the same doc.
 */
export default function BrandDocApp() {
  return (
    <div className="vv-app-shell flex h-full min-h-[520px] flex-col bg-[var(--void)] text-[var(--ivory)]">
      <GlobalStyles />
      <BrandDocPanel variant="page" />
    </div>
  );
}
