import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCampaign } from '../../contexts/CampaignContext';
import styles from './CampaignSettings.module.css';

export function CampaignSettings() {
  const { campaign, isGM } = useCampaign();
  const [copied, setCopied] = useState(false);

  if (!campaign || !isGM) return null;

  function copyCode() {
    if (!campaign?.invite_code) return;
    navigator.clipboard.writeText(campaign.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>
        <Link to="/campaigns" className={styles.breadcrumbLink}>Campaigns</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <Link to={`/campaigns/${campaign.id}/maps`} className={styles.breadcrumbLink}>
          {campaign.name}
        </Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span>Settings</span>
      </div>

      <h2 className={styles.title}>Campaign Settings</h2>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Campaign Name</h3>
        <p className={styles.value}>{campaign.name}</p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Invite Code</h3>
        <p className={styles.hint}>Share this code with players so they can join your campaign.</p>
        <div className={styles.codeRow}>
          <code className={styles.code}>{campaign.invite_code}</code>
          <button className={styles.copyBtn} onClick={copyCode}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
