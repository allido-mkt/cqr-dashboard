const payload = $json.write_payloads.CohortMaturity || [];
return payload.map(row => ({ json: { master_file_id: $json.master_file_id, ...row } }));