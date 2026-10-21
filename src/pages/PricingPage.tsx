import React, { useState } from 'react';
import { Check, ShieldCheck, Zap, Sparkles, Cloud, ArrowRight, Lock, Clock, HelpCircle } from 'lucide-react';

interface PricingPageProps {
  onNavigate: (route: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      name: 'Free',
      tagline: 'Simple & quick transfers for everyone',
      price: '$0',
      period: 'forever',
      highlight: false,
      badge: null,
      buttonText: 'Start Free',
      buttonVariant: 'secondary' as const,
      features: [
        'Up to 10 GB file transfer',
        'Direct 6-digit key real-time exchange',
        '48-hour shareable links',
        'Standard transfer speeds',
        'P2P direct browser encryption',
        'Community support'
      ]
    },
    {
      name: 'SwiftDrop Plus',
      tagline: 'Supercharged speed & 1 TB cloud storage',
      price: billingCycle === 'monthly' ? '$5.99' : '$4.99',
      period: billingCycle === 'monthly' ? '/ month' : '/ month (billed yearly)',
      highlight: true,
      badge: 'MOST POPULAR',
      buttonText: 'Upgrade to Plus',
      buttonVariant: 'primary' as const,
      features: [
        'Up to 50 GB single file transfer',
        '1 TB (1,000 GB) My Link cloud storage',
        'Custom link expiration (up to unlimited)',
        'Password-protected download links',
        'Download count limits & tracking',
        'Maximum priority multi-stream speed',
        '100% ad-free experience',
        'Priority customer support'
      ]
    },
    {
      name: 'Business',
      tagline: 'Advanced security & team management',
      price: '$12.99',
      period: '/ user / month',
      highlight: false,
      badge: 'FOR TEAMS',
      buttonText: 'Contact Sales',
      buttonVariant: 'secondary' as const,
      features: [
        'Unlimited file transfer size',
        'Unlimited team storage & traffic',
        'Custom corporate subdomain & branding',
        'Centralized team management & billing',
        'Security audit logs & IP allowlists',
        'Custom SSO (SAML / Okta / Azure AD)',
        'Dedicated account manager',
        '24/7 SLA enterprise support'
      ]
    }
  ];

  const comparisonRows = [
    { feature: 'Direct P2P Transfer (6-digit key)', free: 'Up to 50 GB', plus: 'Up to 50 GB', business: 'Unlimited' },
    { feature: 'My Link Cloud Storage', free: 'None (48h max)', plus: '1 TB (1,000 GB)', business: 'Unlimited' },
    { feature: 'Single File Upload Limit', free: '10 GB', plus: '50 GB', business: 'Unlimited' },
    { feature: 'Custom Link Expiration', free: 'Fixed 48 hours', plus: 'Custom / Unlimited', business: 'Custom / Unlimited' },
    { feature: 'Password-Protected Links', free: 'No', plus: 'Yes (AES-256)', business: 'Yes (AES-256)' },
    { feature: 'Max Download Count Limit', free: 'No', plus: 'Yes', business: 'Yes' },
    { feature: 'Multi-stream Acceleration', free: 'Standard', plus: '4x Ultra-Speed', business: 'Dedicated CDN' },
    { feature: 'Ad-Free Experience', free: 'No', plus: 'Yes (100% clean)', business: 'Yes' },
    { feature: 'Team Admin & Audit Logs', free: 'No', plus: 'No', business: 'Yes' }
  ];

  return (
    <div className="w-full bg-white text-[#212529] py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-[#fe4543] bg-[#fff0f2] px-3 py-1 rounded-full">
            Simple, Transparent Pricing
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212529] mt-3 tracking-tight">
            Send faster, store longer with <span className="text-[#fe4543]">Plus</span>
          </h1>
          <p className="text-sm text-[#666666] mt-2">
            Choose the plan that fits your transfer needs. Cancel anytime.
          </p>

          {/* Monthly / Yearly Toggle */}
          <div className="mt-6 inline-flex items-center p-1 bg-[#f1f1f1] rounded-full border border-[#ebebeb]">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-[#212529] shadow-xs'
                  : 'text-[#666666] hover:text-[#212529]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-white text-[#212529] shadow-xs'
                  : 'text-[#666666] hover:text-[#212529]'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] bg-[#fe4543] text-white px-1.5 py-0.5 rounded-full font-bold">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-16">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-200 relative ${
                p.highlight
                  ? 'border-[#fe4543] shadow-[0_8px_30px_rgba(254,69,67,0.12)] bg-white ring-2 ring-[#fe4543]'
                  : 'border-[#ebebeb] shadow-xs bg-white hover:border-[#d0d0d0]'
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#fe4543] text-white text-[10px] font-extrabold tracking-wider uppercase px-3 py-0.5 rounded-full shadow-xs">
                  {p.badge}
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-[#212529]">{p.name}</h3>
                <p className="text-xs text-[#666666] mt-1 min-h-[32px]">{p.tagline}</p>

                <div className="my-6 pb-6 border-b border-[#f1f1f1]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-[#212529] tracking-tight">{p.price}</span>
                    <span className="text-xs text-[#666666]">{p.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {p.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-[#212529]">
                      <div className="w-4 h-4 rounded-full bg-[#fff0f2] text-[#fe4543] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className={`w-full h-11 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] ${
                    p.buttonVariant === 'primary'
                      ? 'bg-[#fe4543] hover:bg-[#d83f53] text-white shadow-sm'
                      : 'bg-[#f8f9fa] hover:bg-[#ebebeb] text-[#212529] border border-[#e0e4e6]'
                  }`}
                >
                  <span>{p.buttonText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#212529]">Compare Plan Features</h2>
            <p className="text-xs text-[#666666] mt-1">Detailed breakdown of everything included in each tier</p>
          </div>

          <div className="overflow-x-auto border border-[#ebebeb] rounded-xl shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#fafafa] border-b border-[#ebebeb] text-[#212529] font-bold">
                <tr>
                  <th className="p-4 w-1/3">Feature</th>
                  <th className="p-4 text-center">Free</th>
                  <th className="p-4 text-center bg-[#fff0f2] text-[#fe4543]">Plus</th>
                  <th className="p-4 text-center">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f1f1]">
                {comparisonRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[#fafafa] transition-colors">
                    <td className="p-4 font-medium text-[#212529]">{r.feature}</td>
                    <td className="p-4 text-center text-[#666666]">{r.free}</td>
                    <td className="p-4 text-center font-bold text-[#fe4543] bg-[#fff0f2]/30">{r.plus}</td>
                    <td className="p-4 text-center text-[#212529] font-semibold">{r.business}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#212529]">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            <div className="p-5 border border-[#ebebeb] rounded-xl bg-white">
              <h4 className="font-bold text-sm text-[#212529]">How does the 6-digit key work?</h4>
              <p className="text-xs text-[#666666] mt-1.5 leading-relaxed">
                When you click Send, a 6-digit key is created in real time. The receiver enters this key into their device to establish a direct P2P link. The transfer is streaming in real time and expires once redeemed.
              </p>
            </div>
            <div className="p-5 border border-[#ebebeb] rounded-xl bg-white">
              <h4 className="font-bold text-sm text-[#212529]">What is My Link in SwiftDrop Plus?</h4>
              <p className="text-xs text-[#666666] mt-1.5 leading-relaxed">
                My Link provides 1 TB of cloud storage where you can generate shareable download links that don't expire after 48 hours. You can customize expiration, set passwords, and manage download limits.
              </p>
            </div>
            <div className="p-5 border border-[#ebebeb] rounded-xl bg-white">
              <h4 className="font-bold text-sm text-[#212529]">Can I cancel my Plus subscription anytime?</h4>
              <p className="text-xs text-[#666666] mt-1.5 leading-relaxed">
                Yes, you can cancel your subscription at any time with one click from your account settings. You will continue to have access to Plus features until the end of your billing cycle.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
