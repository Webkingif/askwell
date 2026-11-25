import { PLANS } from "@askwell/shared";
import { Badge, GlassPanel, cx } from "../ui";
import { CtaLink } from "./CtaLink";
import { SIGN_UP_PATH } from "./Hero";
import { LandingSection } from "./Section";
import { Reveal } from "./Reveal";
import { PLAN_NAMES, buildPricingRows, splitPrice } from "./pricing";

export function Pricing() {
  const rows = buildPricingRows();
  return (
    <LandingSection
      id="pricing"
      eyebrow="Pricing"
      title="Start free. Upgrade when it pays off."
    >
      <Reveal>
        <GlassPanel padding="none" className="overflow-hidden">
          {/* Fixed layout below sm so the table always fits 375 px; auto layout on desktop as before. */}
          <table className="w-full table-fixed border-collapse text-left text-xs sm:table-auto sm:text-sm">
            <caption className="sr-only">Free and Pro plans compared</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-[36%] p-3 sm:w-2/5 sm:p-6">
                  <span className="sr-only">Feature</span>
                </th>
                {PLANS.map((plan) => {
                  const { amount, per } = splitPrice(plan);
                  return (
                    <th
                      key={plan}
                      scope="col"
                      className={cx(
                        "p-3 align-top sm:p-6",
                        plan === "pro" && "bg-subtle",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                        {PLAN_NAMES[plan]}
                        {plan === "pro" && (
                          <span className="hidden sm:inline-flex">
                            <Badge variant="solid">Popular</Badge>
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block font-normal sm:mt-2">
                        <span className="block text-xl font-semibold sm:inline sm:text-3xl">
                          {amount}
                        </span>
                        <span className="block text-muted sm:inline">
                          {per}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-line last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-3 py-3 font-normal break-words text-muted sm:px-6"
                  >
                    {row.label}
                  </th>
                  {PLANS.map((plan) => (
                    <td
                      key={plan}
                      className={cx(
                        "px-3 py-3 font-medium break-words sm:px-6",
                        plan === "pro" && "bg-subtle",
                      )}
                    >
                      {row.values[plan]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
        <div className="mt-8 flex justify-center">
          <CtaLink href={SIGN_UP_PATH} size="lg">
            Start free
          </CtaLink>
        </div>
      </Reveal>
    </LandingSection>
  );
}
